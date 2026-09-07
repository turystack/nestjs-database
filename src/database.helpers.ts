import type { MaterializeSchema } from '@/drizzle/schema-builder.drizzle.js'
import type {
	PgSchemaBuilder,
	RelationsHelpers,
	RelationsResolverResult,
	SchemaResolverResult,
} from '@/drizzle/schema-builder.types.drizzle.js'
import type {
	DynamoSchemaBuilder,
	DynamoSchemaResolverResult,
} from '@/dynamodb/schema-builder.types.dynamodb.js'

/**
 * Identity helper that preserves the inferred schema type of a resolver.
 * Use it in the domain lib that owns the database schema — annotating the
 * resolver with `DatabaseSchemaResolver` would widen the type and break
 * repository inference.
 *
 * @example
 * ```ts
 * export const databaseSchema = defineDatabaseSchema((schema) => ({
 *   users: schema.table({
 *     id: schema.uuid().primaryKey(),
 *     name: schema.text().notNull(),
 *   }),
 * }))
 * ```
 */
export function defineDatabaseSchema<TResult extends SchemaResolverResult>(
	resolver: (schema: PgSchemaBuilder) => TResult,
): (schema: PgSchemaBuilder) => TResult {
	return resolver
}

/**
 * Identity helper that types the `tables` parameter from a schema resolver
 * while preserving the inferred relations type.
 *
 * @example
 * ```ts
 * export const databaseRelations = defineDatabaseRelations(
 *   databaseSchema,
 *   (tables, { relations }) => ({
 *     usersRelations: relations(tables.users, ({ many }) => ({
 *       posts: many(tables.posts),
 *     })),
 *   }),
 * )
 * ```
 */
export function defineDatabaseRelations<
	TSchemaResolver extends (schema: PgSchemaBuilder) => SchemaResolverResult,
	TRelations extends RelationsResolverResult,
>(
	_schemaResolver: TSchemaResolver,
	resolver: (
		tables: MaterializeSchema<ReturnType<TSchemaResolver>>,
		helpers: RelationsHelpers,
	) => TRelations,
): (
	tables: MaterializeSchema<ReturnType<TSchemaResolver>>,
	helpers: RelationsHelpers,
) => TRelations {
	return resolver
}

/**
 * The DynamoDB counterpart of {@link defineDatabaseSchema}.
 *
 * Separate rather than overloaded because the two builders have nothing in
 * common: one hands out column types, the other hands out attribute types plus
 * the key paths a read may take.
 *
 * @example
 * ```ts
 * export const databaseSchema = defineDynamoDatabaseSchema((t) => ({
 *   auditEvents: t.table({
 *     attributes: {
 *       occurredAt: t.string(),
 *       organizationId: t.string(),
 *     },
 *     key: { partition: 'organizationId', sort: 'occurredAt' },
 *   }),
 * }))
 * ```
 */
export function defineDynamoDatabaseSchema<
	TResult extends DynamoSchemaResolverResult,
>(
	resolver: (schema: DynamoSchemaBuilder) => TResult,
): (schema: DynamoSchemaBuilder) => TResult {
	return resolver
}
