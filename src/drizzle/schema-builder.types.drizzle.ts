import type { ColumnBuilderBase, Relation, Relations, relations } from 'drizzle-orm'
import type * as PgCore from 'drizzle-orm/pg-core'

/**
 * Opaque container produced by schema.table({ ...columnBuilders }).
 * Carries the column map but defers actual Drizzle table construction
 * until the module iterates the resolver result and knows the table name (key).
 */
export type ColumnMap<
	TColumns extends Record<string, ColumnBuilderBase>,
> = {
	readonly __columns: TColumns
}

interface SchemaTableBuilder {
	table<TColumns extends Record<string, ColumnBuilderBase>>(
		columns: TColumns,
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
