import type { BuildColumns, ColumnBuilderBase, Table } from 'drizzle-orm'
import type {
	PgColumnBuilderBase,
	PgTableWithColumns,
} from 'drizzle-orm/pg-core'
import type {
	MySqlColumnBuilderBase,
	MySqlTableWithColumns,
} from 'drizzle-orm/mysql-core'
import type {
	SQLiteColumnBuilderBase,
	SQLiteTableWithColumns,
} from 'drizzle-orm/sqlite-core'
import * as mysqlCore from 'drizzle-orm/mysql-core'
import * as pgCore from 'drizzle-orm/pg-core'
import * as sqliteCore from 'drizzle-orm/sqlite-core'

import type { DatabaseAdapter } from '@/database.types.js'

import type {
	ColumnMap,
	MysqlSchemaBuilder,
	PgSchemaBuilder,
	SchemaResolverResult,
	SqliteSchemaBuilder,
} from '@/drizzle/schema-builder.types.drizzle.js'

const tableBuilder = {
	table<TColumns extends Record<string, ColumnBuilderBase>>(
		columns: TColumns,
	): ColumnMap<TColumns> {
		return { __columns: columns }
	},
}

export function createSchemaBuilder(adapter: 'postgresql'): PgSchemaBuilder
export function createSchemaBuilder(adapter: 'mysql'): MysqlSchemaBuilder
export function createSchemaBuilder(adapter: 'sqlite'): SqliteSchemaBuilder
export function createSchemaBuilder(
	adapter: DatabaseAdapter,
): PgSchemaBuilder | MysqlSchemaBuilder | SqliteSchemaBuilder
export function createSchemaBuilder(
	adapter: DatabaseAdapter,
): PgSchemaBuilder | MysqlSchemaBuilder | SqliteSchemaBuilder {
	switch (adapter) {
		case 'postgresql': {
			const { pgTable: _pgTable, ...pgColumns } = pgCore
			return { ...tableBuilder, ...pgColumns } as PgSchemaBuilder
		}
		case 'mysql': {
			const { mysqlTable: _mysqlTable, ...mysqlColumns } = mysqlCore
			return { ...tableBuilder, ...mysqlColumns } as MysqlSchemaBuilder
		}
		case 'sqlite': {
			const { sqliteTable: _sqliteTable, ...sqliteColumns } = sqliteCore
			return { ...tableBuilder, ...sqliteColumns } as SqliteSchemaBuilder
		}
	}
}

function createTable(
	adapter: DatabaseAdapter,
	tableName: string,
	columns: Record<string, unknown>,
): Table {
	switch (adapter) {
		case 'postgresql':
			return pgCore.pgTable(
				tableName,
				columns as Record<string, pgCore.PgColumnBuilderBase>,
			)
		case 'mysql':
			return mysqlCore.mysqlTable(
				tableName,
				columns as Record<string, mysqlCore.MySqlColumnBuilderBase>,
			)
		case 'sqlite':
			return sqliteCore.sqliteTable(
				tableName,
				columns as Record<string, sqliteCore.SQLiteColumnBuilderBase>,
			)
	}
}

type MaterializePg<TResult extends SchemaResolverResult> = {
	[K in keyof TResult & string]: TResult[K] extends ColumnMap<infer C>
		? PgTableWithColumns<{
				name: K
				schema: undefined
				columns: BuildColumns<
					K,
					C & Record<string, PgColumnBuilderBase>,
					'pg'
				>
				dialect: 'pg'
			}>
		: never
}

type MaterializeMysql<TResult extends SchemaResolverResult> = {
	[K in keyof TResult & string]: TResult[K] extends ColumnMap<infer C>
		? MySqlTableWithColumns<{
				name: K
				schema: undefined
				columns: BuildColumns<
					K,
					C & Record<string, MySqlColumnBuilderBase>,
					'mysql'
				>
				dialect: 'mysql'
			}>
		: never
}

type MaterializeSqlite<TResult extends SchemaResolverResult> = {
	[K in keyof TResult & string]: TResult[K] extends ColumnMap<infer C>
		? SQLiteTableWithColumns<{
				name: K
				schema: undefined
				columns: BuildColumns<
					K,
					C & Record<string, SQLiteColumnBuilderBase>,
					'sqlite'
				>
				dialect: 'sqlite'
			}>
		: never
}

export type MaterializeSchema<
	TAdapter extends DatabaseAdapter,
	TResult extends SchemaResolverResult,
> = TAdapter extends 'postgresql'
	? MaterializePg<TResult>
	: TAdapter extends 'mysql'
		? MaterializeMysql<TResult>
		: TAdapter extends 'sqlite'
			? MaterializeSqlite<TResult>
			: never

export function materializeSchema<TResult extends SchemaResolverResult>(
	adapter: 'postgresql',
	resolverResult: TResult,
): MaterializePg<TResult>
export function materializeSchema<TResult extends SchemaResolverResult>(
	adapter: 'mysql',
	resolverResult: TResult,
): MaterializeMysql<TResult>
export function materializeSchema<TResult extends SchemaResolverResult>(
	adapter: 'sqlite',
	resolverResult: TResult,
): MaterializeSqlite<TResult>
export function materializeSchema(
	adapter: DatabaseAdapter,
	resolverResult: SchemaResolverResult,
): Record<string, Table> {
	return Object.fromEntries(
		Object.entries(resolverResult).map(([tableName, columnMap]) => [
			tableName,
			createTable(adapter, tableName, columnMap.__columns),
		]),
	)
}
