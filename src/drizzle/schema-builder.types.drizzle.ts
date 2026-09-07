import type {
	BuildExtraConfigColumns,
	ColumnBuilderBase,
	Relation,
	Relations,
	relations,
} from 'drizzle-orm'
import type * as PgCore from 'drizzle-orm/pg-core'

/**
 * Opaque container produced by schema.table({ ...columnBuilders }).
 * Carries the column map but defers actual Drizzle table construction
 * until the module iterates the resolver result and knows the table name (key).
 */
/**
 * Table-level constraints: unique indexes, plain indexes, checks, composite
 * keys. Drizzle takes them as `pgTable`'s third argument, and the callback
 * receives the built columns so a constraint names a column instead of a
 * string that nothing checks.
 *
 * @example
 * ```ts
 * workspaces: schema.table(
 *   {
 *     workspaceId: schema.uuid().primaryKey(),
 *     organizationId: schema.uuid().notNull(),
 *     slug: schema.text().notNull(),
 *   },
 *   (table) => [
 *     schema.uniqueIndex('workspace_org_slug').on(table.organizationId, table.slug),
 *   ],
 * )
 * ```
 */
export type TableConstraints<
	TColumns extends Record<string, ColumnBuilderBase>,
> = (
	columns: BuildExtraConfigColumns<string, TColumns, 'pg'>,
) => PgCore.PgTableExtraConfigValue[]

/**
 * The same callback with its columns erased.
 *
 * The stored form has to forget which columns it was written against: a
 * callback is contravariant in its parameter, so keeping `TColumns` here would
 * make `ColumnMap` invariant — and a schema of concrete tables would stop being
 * assignable to `SchemaResolverResult`, which is the type every helper in this
 * package takes.
 */
export type AnyTableConstraints = (
	columns: never,
) => PgCore.PgTableExtraConfigValue[]

export type ColumnMap<TColumns extends Record<string, ColumnBuilderBase>> = {
	readonly __columns: TColumns
	readonly __constraints?: AnyTableConstraints
}

interface SchemaTableBuilder {
	table<TColumns extends Record<string, ColumnBuilderBase>>(
		columns: TColumns,
		constraints?: TableConstraints<TColumns>,
	): ColumnMap<TColumns>
}

/** Schema builder for the postgresql adapter — exposes all pg column types. */
export type PgSchemaBuilder = SchemaTableBuilder &
	Omit<typeof PgCore, 'pgTable'>

export type SchemaBuilder = PgSchemaBuilder

export type SchemaResolverResult = Record<
	string,
	ColumnMap<Record<string, ColumnBuilderBase>>
>

export type RelationsResolverResult = Record<
	string,
	Relations<string, Record<string, Relation>>
>

export interface RelationsHelpers {
	relations: typeof relations
}
