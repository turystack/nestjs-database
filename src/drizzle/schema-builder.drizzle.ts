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

// biome-ignore lint/suspicious/noExplicitAny: table instances vary per adapter dialect
type AnyTable = any

const tableBuilder = {
	table<TColumns extends Record<string, unknown>>(
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
	// biome-ignore lint/suspicious/noExplicitAny: column builders vary per adapter dialect
	columns: Record<string, any>,
): AnyTable {
	switch (adapter) {
		case 'postgresql':
			return pgCore.pgTable(tableName, columns)
		case 'mysql':
			return mysqlCore.mysqlTable(tableName, columns)
		case 'sqlite':
			return sqliteCore.sqliteTable(tableName, columns)
	}
}

export function materializeSchema(
	adapter: DatabaseAdapter,
	resolverResult: SchemaResolverResult,
): Record<string, AnyTable> {
	return Object.fromEntries(
		Object.entries(resolverResult).map(([tableName, columnMap]) => [
			tableName,
			createTable(adapter, tableName, columnMap.__columns),
		]),
	)
}
