# @turystack/nestjs-database

Typed database module for NestJS: schema builder, per-table repositories, and transactional decorator. PostgreSQL (Drizzle) built-in.

## Installation

```bash
pnpm add @turystack/nestjs-database
```

### Peer dependencies

The host application provides these:

```bash
pnpm add @nestjs/common @nestjs/core @turystack/exceptions @turystack/nestjs-config drizzle-orm reflect-metadata uuidv7
```

Optional — install only the ones whose feature you use:

```bash
pnpm add pg
```

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
