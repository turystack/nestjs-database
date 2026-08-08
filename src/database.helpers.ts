import type { MaterializeSchema } from '@/drizzle/schema-builder.drizzle.js'
import type {
	PgSchemaBuilder,
	RelationsHelpers,
	RelationsResolverResult,
	SchemaResolverResult,
} from '@/drizzle/schema-builder.types.drizzle.js'

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
