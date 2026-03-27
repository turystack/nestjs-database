import type { SchemaBuilder, SchemaResolverResult } from '@/drizzle/schema-builder.types.drizzle.js'

/** Supported database adapters. */
export type DatabaseAdapter = 'postgresql' | 'mysql' | 'sqlite'

/**
 * Options for {@link DatabaseModule.register}.
 * Each adapter has its own nested config key.
 *
 * @example
 * ```ts
 * import { integer, varchar } from 'drizzle-orm/pg-core'
 *
 * DatabaseModule.register({
 *   adapter: 'postgresql',
 *   postgresql: { url: process.env.DATABASE_URL },
 *   schemaResolver: (schema) => ({
 *     user: schema.table({
 *       id: integer().primaryKey().generatedAlwaysAsIdentity(),
 *       name: varchar().notNull(),
 *     }),
 *   }),
 * })
 * ```
 */
export type DatabaseModuleOptions<TResult extends SchemaResolverResult = SchemaResolverResult> =
  | {
      adapter: 'postgresql'
      postgresql: { url: string }
      schemaResolver: (schema: SchemaBuilder) => TResult
    }
  | {
      adapter: 'mysql'
      mysql: { url: string }
      schemaResolver: (schema: SchemaBuilder) => TResult
    }
  | {
      adapter: 'sqlite'
      sqlite: { url: string }
      schemaResolver: (schema: SchemaBuilder) => TResult
    }
