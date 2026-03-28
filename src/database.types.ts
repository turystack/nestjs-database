import type { Table } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type {
	MaterializeSchema,
	MaterializeSchemaWithRelations,
} from '@/drizzle/schema-builder.drizzle.js'
import type {
	PgSchemaBuilder,
	RelationsHelpers,
	RelationsResolverResult,
	SchemaResolverResult,
} from '@/drizzle/schema-builder.types.drizzle.js'
import type { InferRepositories } from '@/repository/table-repository.types.js'

export type DatabaseOptions = {
	url: string
}

/**
 * Options for {@link DatabaseModule.register}.
 * The `schemaResolver` receives a typed schema builder with all column
 * helpers for PostgreSQL — no separate drizzle import needed.
 * The optional `relationsResolver` receives the materialized tables and
 * a `{ relations }` helper to define relations between tables.
 */
export type DatabaseModuleOptions<
	TResult extends SchemaResolverResult = SchemaResolverResult,
	TRelations extends RelationsResolverResult | undefined = undefined,
> = {
	adapter: 'postgresql'
	postgresql: DatabaseOptions
	schemaResolver: (schema: PgSchemaBuilder) => TResult
	relationsResolver?: (
		tables: MaterializeSchema<TResult>,
		helpers: RelationsHelpers,
	) => TRelations & RelationsResolverResult
}

/**
 * Type registry for module augmentation.
 * Augment this interface via `declare module` to provide concrete types
 * for the drizzle database instance and schema used by `DatabaseService`.
 *
 * @example
 * ```ts
 * import type { InferDatabaseConfig } from '@turystack/nestjs-database'
 * import type { databaseSchema, databaseRelations } from './database.schema.js'
 *
 * declare module '@turystack/nestjs-database' {
 *   interface DatabaseServiceRegistry
 *     extends InferDatabaseConfig<
 *       ReturnType<typeof databaseSchema>,
 *       ReturnType<typeof databaseRelations>
 *     > {}
 * }
 * ```
 */
export interface DatabaseServiceRegistry {}

/** Resolves to the augmented `raw` db type, or `unknown` when the registry is not augmented. */
export type ResolvedDatabase = DatabaseServiceRegistry extends {
	raw: infer TDb
}
	? TDb
	: unknown

/** Resolves to the augmented materialized schema, or empty record when not augmented. */
export type ResolvedSchema = DatabaseServiceRegistry extends {
	schema: infer TSchema extends Record<string, Table>
}
	? TSchema
	: Record<string, Table>

/** Maps each schema table to its typed `TableRepository`. */
export type ResolvedRepositories = DatabaseServiceRegistry extends {
	raw: infer TDb
	schema: infer TSchema extends Record<string, Table>
}
	? InferRepositories<TDb, TSchema>
	: {}

/**
 * Infers the fully-typed drizzle database instance from a schema and optional relations.
 */
export type InferDatabase<
	TSchema extends SchemaResolverResult,
	TRelations extends RelationsResolverResult | undefined = undefined,
> = NodePgDatabase<MaterializeSchemaWithRelations<TSchema, TRelations>>

/**
 * Convenience type for augmenting `DatabaseServiceRegistry` in a single declaration.
 * Provides both `raw` (drizzle client typed with tables + relations) and
 * `schema` (materialized tables only, for repository inference).
 *
 * @example
 * ```ts
 * declare module '@turystack/nestjs-database' {
 *   interface DatabaseServiceRegistry
 *     extends InferDatabaseConfig<
 *       ReturnType<typeof databaseSchema>,
 *       ReturnType<typeof databaseRelations>
 *     > {}
 * }
 * ```
 */
export type InferDatabaseConfig<
	TSchemaResult extends SchemaResolverResult,
	TRelationsResult extends RelationsResolverResult | undefined = undefined,
> = {
	raw: InferDatabase<TSchemaResult, TRelationsResult>
	schema: MaterializeSchema<TSchemaResult>
}

export type DatabaseSchemaResolver = (
	schema: PgSchemaBuilder,
) => SchemaResolverResult

export type DatabaseRelationsResolver<
	TSchemaResult extends SchemaResolverResult,
> = (
	tables: MaterializeSchema<TSchemaResult>,
	helpers: RelationsHelpers,
) => RelationsResolverResult
