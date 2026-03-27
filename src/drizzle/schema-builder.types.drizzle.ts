import type * as MysqlCore from 'drizzle-orm/mysql-core'
import type * as PgCore from 'drizzle-orm/pg-core'
import type * as SqliteCore from 'drizzle-orm/sqlite-core'

/**
 * Opaque container produced by schema.table({ ...columnBuilders }).
 * Carries the column map but defers actual Drizzle table construction
 * until the module iterates the resolver result and knows the table name (key).
 */
export type ColumnMap<TColumns extends Record<string, unknown>> = {
	readonly __columns: TColumns
}

interface SchemaTableBuilder {
	table<TColumns extends Record<string, unknown>>(
		columns: TColumns,
	): ColumnMap<TColumns>
}

/** Schema builder for the postgresql adapter — exposes all pg column types. */
export type PgSchemaBuilder = SchemaTableBuilder &
	Omit<typeof PgCore, 'pgTable'>

/** Schema builder for the mysql adapter — exposes all mysql column types. */
export type MysqlSchemaBuilder = SchemaTableBuilder &
	Omit<typeof MysqlCore, 'mysqlTable'>

/** Schema builder for the sqlite adapter — exposes all sqlite column types. */
export type SqliteSchemaBuilder = SchemaTableBuilder &
	Omit<typeof SqliteCore, 'sqliteTable'>

export type SchemaBuilder =
	| PgSchemaBuilder
	| MysqlSchemaBuilder
	| SqliteSchemaBuilder

export type SchemaResolverResult = Record<
	string,
	ColumnMap<Record<string, unknown>>
>
