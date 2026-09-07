# Database

A typed database module for NestJS: define the schema once, get one fully-typed repository per table on `DatabaseService`, plus a `@Transactional` decorator. PostgreSQL (Drizzle) is the built-in adapter option.

## The idea

The **app** (API or lambda handler) registers `DatabaseModule.register()` once at the root — it owns the connection. The **database package** owns the schema and the typing: it defines the tables and augments the `DatabaseServiceRegistry`. Domain services just inject `DatabaseService` and use `this.db.users.findById()` — no module imports, no connection knowledge. The `declare module` augmentation is global in TypeScript, so the typing works in any file of the monorepo regardless of who registered the module.

## Setup

### 1. `@repo/database` — schema + typing (single source of truth)

```ts
// packages/database/src/database.schema.ts
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

If a package never imports anything from `@repo/database`, add `import type {} from '@repo/database'` to its entry so the augmentation is in the type graph.

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

Three entry points. The barrel is engine-neutral; each engine's factories sit
behind its own path, so an application that registers one adapter never resolves
the other's types and never installs the peer behind it.

### `@turystack/nestjs-database`

| Export | Description |
|---|---|
| `DatabaseModule.register(options \| (config) => options)` | Global registration — connects and builds the repositories; the factory form injects `ConfigService` |
| `DatabaseService` / `DATABASE_SERVICE` | The repository hub + DI token |
| `defineDatabaseSchema(resolver)` / `defineDatabaseRelations(schema, resolver)` | Inference-preserving helpers for the package that owns the schema |
| `defineDynamoDatabaseSchema(resolver)` | The DynamoDB counterpart |
| `InferDatabaseConfig<Schema, Relations?>` / `InferDynamoDatabaseConfig<Schema>` | Registry augmentation payload |
| `DatabaseModuleOptions` | The options union, for a factory extracted to a variable |
| `@Transactional(isolationLevel?)` / `IsolationLevel` | Method decorator — one transaction per call tree |
| `onBeforeCommit` / `onAfterCommit` / `getCurrentTx` / `transactionState` | Transaction hooks |
| `registerAuditActor` / `currentAuditActor` / `AuditActorReader` | Who the write is attributed to |
| `RecordNotFoundError` / `RecordNotCreatedError` | Typed repository errors (`code`: `record_not_found` / `record_not_created`) |

### `@turystack/nestjs-database/postgresql`

| Export | Description |
|---|---|
| `createSchemaBuilder()` / `materializeSchema(result)` | Turn a resolver into Drizzle tables, for migrations |
| `TableRepository` | The runtime repository class (for `instanceof` checks / extension) |

### `@turystack/nestjs-database/dynamodb`

| Export | Description |
|---|---|
| `createDynamoSchemaBuilder()` / `materializeDynamoSchema(result)` | Turn a resolver into table definitions |
| `DynamoRepository` | The runtime repository class |

### What is not exported, on purpose

The type machinery — `CreateInput`, `WhereCallback`, `ReturningColumns`,
`DynamoQueryInput`, `PgSchemaBuilder` and the rest — is not nameable through an
import. It still types every call: `db.users.findById(id)` returns exactly what
it always did, because inference does not need a name.

What the absence prevents is an application writing its own signatures against
this package's internals. A repository whose method signature mentions
`WhereCallback<TTable>` is a repository coupled to how this package models a
predicate today, and that is a coupling neither side asked for.

## Adapters

`adapter` is a discriminated union: each engine brings its own config block and
its own schema builder, so choosing one and passing the other's schema does not
compile. Adding an engine is an entry in the record in `database.module.ts`,
never an edit to the branch that already serves the others.

Each engine's driver is an optional peer, imported only when that engine is the
one registered — the package's entry point loads with neither installed. The
PostgreSQL schema builder lives at `@turystack/nestjs-database/postgresql`
rather than the root for the same reason: everything it exports imports
`drizzle-orm` at module scope.

| Adapter | Driver peers | Notes |
|---|---|---|
| `'postgresql'` | `drizzle-orm`, `pg` | Drizzle `node-postgres` client — lazy pool, full pg column builder set via `schema.*` |
| `'dynamodb'` | `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` | AWS SDK v3 document client — declared key paths, cursor pagination, a deliberately smaller repository |

### `'dynamodb'`

The peers are optional and loaded lazily: an app on PostgreSQL never installs
`@aws-sdk/client-dynamodb` or `@aws-sdk/lib-dynamodb`.

```ts
export const databaseSchema = defineDynamoDatabaseSchema((t) => ({
  auditEvents: t.table({
    attributes: {
      actorId: t.string(),
      auditEventId: t.string(),
      occurredAt: t.string(),
      organizationId: t.string(),
      metadata: t.map().optional(),
    },
    key: { partition: 'organizationId', sort: 'occurredAt' },
    indexes: { byActor: { partition: 'organizationId', sort: 'actorId' } },
  }),
}))

declare module '@turystack/nestjs-database' {
  interface DatabaseServiceRegistry
    extends InferDynamoDatabaseConfig<ReturnType<typeof databaseSchema>> {}
}
```

```ts
DatabaseModule.register((config) => ({
  adapter: 'dynamodb',
  dynamodb: {
    region: config.get('AWS_REGION'),
    tablePrefix: config.get('DYNAMODB_TABLE_PREFIX'),
    endpoint: config.get('DYNAMODB_ENDPOINT'), // DynamoDB Local, in tests
  },
  schemaResolver: databaseSchema,
}))
```

**A smaller repository, on purpose.** In PostgreSQL you declare columns and
query whatever you like; here you declare access paths and can only query
those. What the engine would merely simulate — by scanning — is absent from the
type instead of present and expensive.

| Method | Notes |
|---|---|
| `findById(key)` / `exists(key)` | `key` is the declared partition (and sort) attributes, nothing else |
| `query({ index?, partition, sort?, direction?, limit?, cursor? })` | The list read. `index` accepts declared index names only |
| `count({ index?, partition, sort? })` | Within one partition. There is no table-wide count |
| `create` / `createMany` / `upsert` | A put is already an upsert; batches chunk at the engine's 25 |
| `updateById(key, data, { expectedVersion?, versionAttribute? })` | Optimistic locking lands as a condition on the write itself |
| `deleteById(key)` | Returns the item it removed |

Absent, and why: `findMany`/`findFirst` (an arbitrary relational read),
`update`/`delete` by predicate (the engine has no write-by-predicate), and a
table-wide `count`.

Pagination is cursor-only. There is no `page`, no `offset` and no `totalItems`,
because the only honest way to produce them is to walk the table — pair it with
`CursorPaginationSchema` and `CursorPaginatedResponseSchema` from
`@turystack/query-dsl`, which the rest of the stack already understands.

**Transactions are a batch, not an open handle.** `@Transactional` collects the
writes and sends one `TransactWriteItems` before it returns. Three things it
refuses rather than approximates:

- a read inside the operation does not see the buffered writes, so `updateById`
  and `deleteById` throw inside a transaction — their contract is to return the
  resulting item, and there is none until the flush;
- more than 100 buffered writes fails, because splitting the batch would stop
  being atomic;
- `@Transactional('serializable')` throws — this engine has no isolation levels,
  and ignoring the argument would be worse than refusing it.
