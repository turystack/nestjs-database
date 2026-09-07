# @turystack/nestjs-database

Typed database module for NestJS: schema builder, per-table repositories, and transactional decorator. PostgreSQL (Drizzle) and DynamoDB adapters.

## Installation

```bash
pnpm add @turystack/nestjs-database
```

### Peer dependencies

The host application provides these:

```bash
pnpm add @nestjs/common @nestjs/core @turystack/exceptions @turystack/nestjs-config reflect-metadata uuidv7
```

Then the driver for the engine you chose, and only that one. Every driver is an
optional peer and is imported lazily, so the package's entry point loads with
neither installed:

```bash
# adapter: 'postgresql'
pnpm add drizzle-orm pg

# adapter: 'dynamodb'
pnpm add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

The PostgreSQL schema builder lives at `@turystack/nestjs-database/postgresql`
rather than the root, for the same reason: everything it exports imports
`drizzle-orm` at module scope, and re-exporting it from the barrel would make
Drizzle required for a DynamoDB app.

```ts
import {
  createSchemaBuilder,
  materializeSchema,
} from '@turystack/nestjs-database/postgresql'
```

### Breaking: three exports moved

`createSchemaBuilder`, `materializeSchema` and `TableRepository` used to come
from the root and now come from `@turystack/nestjs-database/postgresql`. Nothing
else moved, and the fix is the import path.

They moved because each of them imports `drizzle-orm` at module scope, so while
they sat in the barrel the "optional" Drizzle peer was required for every
consumer — including an app that only ever registers `adapter: 'dynamodb'`.

This is an entry-point change; the package is still published as `1.0.0` and the
version bump is a release decision, not a code one.

## Documentation

Options, API reference and examples:

**https://tury.dev/libs/nestjs-database**

## Development

```bash
pnpm install
pnpm typecheck
pnpm check
pnpm test
pnpm build
```
