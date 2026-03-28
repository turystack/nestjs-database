import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import type {
	MysqlSchemaBuilder,
	PgSchemaBuilder,
	SchemaResolverResult,
	SqliteSchemaBuilder,
} from '@/drizzle/schema-builder.types.drizzle.js'
import type { MaterializeSchema } from '@/drizzle/schema-builder.drizzle.js'

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

/**
 * Type registry for module augmentation.
 * Augment this interface via `declare module` to provide a concrete type
 * for the drizzle database instance returned by `DatabaseService.db`.
 *
 * @example
 * ```ts
 * import type { InferDatabase } from '@turystack/nestjs-database'
 * import type { createDatabaseConfig } from './database.schema.js'
 *
 * declare module '@turystack/nestjs-database' {
 *   interface DatabaseServiceRegistry {
 *     db: InferDatabase<ReturnType<typeof createDatabaseConfig>>
 *   }
 * }
 * ```
 */
export interface DatabaseServiceRegistry {
	db: unknown
}

/**
 * Infers the fully-typed drizzle database instance from a {@link DatabaseModuleOptions} config.
 *
 * The consumer must use `satisfies DatabaseModuleOptions` (instead of an explicit return type
 * annotation) to preserve the narrowed adapter and schema types.
 */
export type InferDatabase<T extends DatabaseModuleOptions> =
	T extends {
		adapter: 'postgresql'
		schemaResolver: (schema: PgSchemaBuilder) => infer R
	}
		? R extends SchemaResolverResult
			? NodePgDatabase<MaterializeSchema<'postgresql', R>>
			: never
		: T extends {
					adapter: 'mysql'
					schemaResolver: (schema: MysqlSchemaBuilder) => infer R
				}
			? R extends SchemaResolverResult
				? MySql2Database<MaterializeSchema<'mysql', R>>
				: never
			: T extends {
						adapter: 'sqlite'
						schemaResolver: (schema: SqliteSchemaBuilder) => infer R
					}
				? R extends SchemaResolverResult
					? BetterSQLite3Database<MaterializeSchema<'sqlite', R>>
					: never
				: never
