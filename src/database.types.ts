import type {
	MysqlSchemaBuilder,
	PgSchemaBuilder,
	SchemaResolverResult,
	SqliteSchemaBuilder,
} from '@/drizzle/schema-builder.types.drizzle.js'

/** Supported database adapters. */
export type DatabaseAdapter = 'postgresql' | 'mysql' | 'sqlite'

/**
 * Options for {@link DatabaseModule.register}.
 * Each adapter has its own nested config key.
 * The `schemaResolver` receives a typed schema builder with all column
 * helpers for the selected adapter — no separate drizzle import needed.
 *
 * @example
 * ```ts
 * DatabaseModule.register({
 *   adapter: 'postgresql',
 *   postgresql: { url: process.env.DATABASE_URL },
 *   schemaResolver: (schema) => ({
 *     user: schema.table({
 *       id: schema.integer().primaryKey().generatedAlwaysAsIdentity(),
 *       name: schema.varchar({ length: 255 }).notNull(),
 *       email: schema.varchar({ length: 255 }).notNull().unique(),
 *     }),
 *   }),
 * })
 * ```
 */
export type DatabaseModuleOptions<
	TResult extends SchemaResolverResult = SchemaResolverResult,
> =
	| {
			adapter: 'postgresql'
			postgresql: { url: string }
			schemaResolver: (schema: PgSchemaBuilder) => TResult
	  }
	| {
			adapter: 'mysql'
			mysql: { url: string }
			schemaResolver: (schema: MysqlSchemaBuilder) => TResult
	  }
	| {
			adapter: 'sqlite'
			sqlite: { url: string }
			schemaResolver: (schema: SqliteSchemaBuilder) => TResult
	  }
