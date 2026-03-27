/**
 * Opaque container produced by schema.table({ ...columnBuilders }).
 * Carries the column map but defers actual Drizzle table construction
 * until the module iterates the resolver result and knows the table name (key).
 */
export type ColumnMap<TColumns extends Record<string, unknown>> = {
	readonly __columns: TColumns
}

export interface SchemaBuilder {
	table<TColumns extends Record<string, unknown>>(
		columns: TColumns,
	): ColumnMap<TColumns>
}

export type SchemaResolverResult = Record<
	string,
	ColumnMap<Record<string, unknown>>
>
