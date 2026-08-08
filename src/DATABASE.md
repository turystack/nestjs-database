# Database

A typed database module for NestJS: define the schema once, get one fully-typed repository per table on `DatabaseService`, plus a `@Transactional` decorator. PostgreSQL (Drizzle) is the built-in adapter option.

## The idea

The **app** (API or lambda handler) registers `DatabaseModule.register()` once at the root — it owns the connection. The **domain lib** owns the schema and the typing: it defines the tables and augments the `DatabaseServiceRegistry`. Domain services just inject `DatabaseService` and use `this.db.users.findById()` — no module imports, no connection knowledge. The `declare module` augmentation is global in TypeScript, so the typing works in any file of the monorepo regardless of who registered the module.

## Setup

### 1. Domain lib — schema + typing (single source of truth)

```ts
// libs/database/database.schema.ts
import {
  defineDatabaseRelations,
  defineDatabaseSchema,
  type InferDatabaseConfig,
} from '@turystack/nestjs-database'

export const databaseSchema = defineDatabaseSchema((schema) => ({
  posts: schema.table({
    authorId: schema.uuid().notNull(),
    id: schema.uuid().primaryKey(),
    title: schema.text().notNull(),
  }),
  users: schema.table({
    id: schema.uuid().primaryKey(),
    name: schema.text().notNull(),
  }),
}))

export const databaseRelations = defineDatabaseRelations(
  databaseSchema,
  (tables, { relations }) => ({
    usersRelations: relations(tables.users, ({ many }) => ({
      posts: many(tables.posts),
    })),
  }),
)

declare module '@turystack/nestjs-database' {
  interface DatabaseServiceRegistry
    extends InferDatabaseConfig<
      ReturnType<typeof databaseSchema>,
      ReturnType<typeof databaseRelations>
    > {}
}
```

### 2. App root — connection, once

The app owns the config schema — `config.get('DATABASE_URL')` is typed through the registry augmentation:

```ts
// apps/api/src/config.schema.ts
import { defineConfigSchema } from '@turystack/nestjs-config'
import { z } from 'zod'

export const configSchema = defineConfigSchema({
  DATABASE_URL: z.string(),
})

declare module '@turystack/nestjs-config' {
  interface ConfigSchemaRegistry {
    schema: typeof configSchema
  }
}
```

```ts
// apps/api/src/app.module.ts
import { ConfigModule } from '@turystack/nestjs-config'
import { DatabaseModule } from '@turystack/nestjs-database'
import { databaseRelations, databaseSchema } from '@repo/database'
import { configSchema } from './config.schema.js'

@Module({
  imports: [
    ConfigModule.register({ schema: configSchema }),
    DatabaseModule.register((config) => ({
      adapter: 'postgresql',
      postgresql: { url: config.get('DATABASE_URL') },
      relationsResolver: databaseRelations,
      schemaResolver: databaseSchema,
    })),
    // other global lib modules: cache, logger, publisher...
  ],
})
export class AppModule {}
```

The module is global — every domain lib can inject `DatabaseService` without importing anything. `register` also accepts a plain options object; the `(config) => options` form injects the `ConfigService` at boot.

### 3. Domain service — typed repositories

```ts
import { Injectable } from '@nestjs/common'
import { DatabaseService, Transactional } from '@turystack/nestjs-database'

@Injectable()
export class UserService {
  constructor(private readonly db: DatabaseService) {}

  async findUser(id: string) {
    return this.db.users.findById(id, { with: { posts: true } })
  }

  @Transactional()
  async renameUser(id: string, name: string) {
    // everything inside runs in one transaction — nested
    // @Transactional calls reuse it
    return this.db.users.updateById(id, { name })
  }
}
```

If a lib never imports anything from the schema lib, add `import type {} from '@repo/database'` to its entry so the augmentation is in the type graph.

## Repositories

Each schema table becomes a repository on `DatabaseService`, combining Drizzle's query API with mutation helpers:

| Method | Notes |
|---|---|
| `findMany(config?)` / `findFirst(config?)` | Drizzle query API — `where`, `columns`, `with`, `orderBy`... |
| `findById(id, { columns?, with? })` | Lookup by primary key |
| `create(data, { returning?, with? })` | Auto-generates a uuidv7 pk when the column has no default; throws `RecordNotCreatedError` when nothing returns |
| `createMany(data[], { returning? })` | Batch insert with the same pk generation |
| `update({ where, data, returning? })` | `where` is required — a callback `(fields, operators) => SQL` or a raw `SQL` |
| `updateById(id, data, { returning?, with? })` | Throws `RecordNotFoundError` when the id does not match |
| `delete({ where, returning? })` / `deleteById(id)` | Same contract as update |
| `upsert({ target, create, update, where?, returning?, with? })` | `INSERT ... ON CONFLICT DO UPDATE` on the target columns |
| `count({ where? })` / `exists({ where })` | Aggregates |

`returning: { id: true }` narrows the returned type to the selected columns. `with` refetches the row with relations after the mutation. `this.db.raw` exposes the underlying Drizzle client (transaction-aware).

## Transactions

`@Transactional(isolationLevel?)` wraps the method in a transaction via `AsyncLocalStorage`: every repository call (and `this.db.raw`) inside the call tree uses the transaction automatically, and nested `@Transactional` methods reuse the surrounding transaction instead of opening a new one.

## API

| Export | Description |
|---|---|
| `DatabaseModule.register(options \| (config) => options)` | Global registration — connects and builds the repositories; the factory form injects `ConfigService` |
| `DatabaseService` / `DATABASE_SERVICE` | The repository hub + DI token |
| `defineDatabaseSchema(resolver)` / `defineDatabaseRelations(schema, resolver)` | Inference-preserving helpers for the domain lib |
| `InferDatabaseConfig<Schema, Relations?>` | Registry augmentation payload (`raw` + `schema`) |
| `@Transactional(isolationLevel?)` | Method decorator — one transaction per call tree |
| `RecordNotFoundError` / `RecordNotCreatedError` | Typed repository errors (`code`: `record_not_found` / `record_not_created`) |
| `TableRepository` | The runtime repository class (for instanceof checks / extension) |

## Adapters

| Adapter | Notes |
|---|---|
| `'postgresql'` | Drizzle `node-postgres` client — lazy pool, full pg column builder set via `schema.*` |
