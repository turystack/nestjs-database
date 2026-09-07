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
import type { InferDynamoRepositories } from '@/dynamodb/dynamodb.repository.types.js'
import type {
	DynamoSchemaBuilder,
	DynamoSchemaResolverResult,
	DynamoTable,
	MaterializeDynamoSchema,
} from '@/dynamodb/schema-builder.types.dynamodb.js'
import type { InferRepositories } from '@/repository/table-repository.types.js'

export type DatabaseOptions = {
	url: string
}

/** Every engine this module can talk to. */
export type DatabaseAdapterName = 'dynamodb' | 'postgresql'

/** Connection details for the DynamoDB engine. */
export type DynamodbOptions = {
	credentials?: {
		accessKeyId: string
		secretAccessKey: string
	}
	/** Points at DynamoDB Local in tests. */
	endpoint?: string
	region: string
	/** Prepended to every table name, so one account can hold many environments. */
	tablePrefix?: string
}

/** SQL isolation levels. An engine without them refuses the option. */
export type IsolationLevel =
	| 'read uncommitted'
	| 'read committed'
	| 'repeatable read'
	| 'serializable'

/** What `@Transactional` passes down to the engine's transaction strategy. */
export type TransactionOptions = {
	isolationLevel?: IsolationLevel
}

/**
 * Options for {@link DatabaseModule.register} with the PostgreSQL engine.
 * The `schemaResolver` receives a typed schema builder with all column
 * helpers for PostgreSQL — no separate drizzle import needed.
 * The optional `relationsResolver` receives the materialized tables and
 * a `{ relations }` helper to define relations between tables.
 */
export type PostgresqlModuleOptions<
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
 * Options for {@link DatabaseModule.register}.
 *
 * A union discriminated on `adapter`: each engine brings its own config block
 * and its own schema builder, so choosing one and passing the other's schema
 * does not compile.
 */
export type DynamodbModuleOptions<
	TResult extends DynamoSchemaResolverResult = DynamoSchemaResolverResult,
> = {
	adapter: 'dynamodb'
	dynamodb: DynamodbOptions
	schemaResolver: (schema: DynamoSchemaBuilder) => TResult
}

export type DatabaseModuleOptions<
	TResult extends SchemaResolverResult = SchemaResolverResult,
	TRelations extends RelationsResolverResult | undefined = undefined,
> = DynamodbModuleOptions | PostgresqlModuleOptions<TResult, TRelations>

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

/**
 * Maps each schema table to its repository.
 *
 * Which repository depends on the engine the registry was augmented with: a
 * DynamoDB schema resolves to the narrower surface, so a call the engine cannot
 * serve is a type error in the app rather than a scan in production.
 */
export type ResolvedRepositories = DatabaseServiceRegistry extends {
	schema: infer TSchema extends Record<string, DynamoTable>
}
	? InferDynamoRepositories<TSchema>
	: DatabaseServiceRegistry extends {
				raw: infer TDb
				schema: infer TSchema extends Record<string, Table>
			}
		? InferRepositories<TDb, TSchema>
		: {}

/**
 * Registry augmentation payload for a DynamoDB app.
 *
 * There is no `raw` worth exposing: the engine's client is a command bus, not a
 * query builder, and handing it out would invite the scans this adapter exists
 * to prevent.
 */
export type InferDynamoDatabaseConfig<
	TSchemaResult extends DynamoSchemaResolverResult,
> = {
	schema: MaterializeDynamoSchema<TSchemaResult>
}

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
