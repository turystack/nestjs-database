import type { DatabaseAdapter } from '@/database.types.js'

import type {
	ColumnMap,
	SchemaBuilder,
	SchemaResolverResult,
} from '@/drizzle/schema-builder.types.drizzle.js'

export function createSchemaBuilder(): SchemaBuilder {
	return {
		table<TColumns extends Record<string, unknown>>(
			columns: TColumns,
		): ColumnMap<TColumns> {
			return {
				__columns: columns,
			}
		},
	}
}

// biome-ignore lint/suspicious/noExplicitAny: table instances vary per adapter dialect
type AnyTable = any

function createTable(
	adapter: DatabaseAdapter,
	tableName: string,
	// biome-ignore lint/suspicious/noExplicitAny: column builders vary per adapter dialect
	columns: Record<string, any>,
): AnyTable {
	switch (adapter) {
		case 'postgresql': {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic require avoids compile-time peer dep
			const { pgTable } = require('drizzle-orm/pg-core') as any
			return pgTable(tableName, columns)
		}
		case 'mysql': {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic require avoids compile-time peer dep
			const { mysqlTable } = require('drizzle-orm/mysql-core') as any
			return mysqlTable(tableName, columns)
		}
		case 'sqlite': {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic require avoids compile-time peer dep
			const { sqliteTable } = require('drizzle-orm/sqlite-core') as any
			return sqliteTable(tableName, columns)
		}
	}
}

export function materializeSchema(
	adapter: DatabaseAdapter,
	resolverResult: SchemaResolverResult,
): Record<string, AnyTable> {
	return Object.fromEntries(
		Object.entries(resolverResult).map(([tableName, columnMap]) => {
			const columns = columnMap.__columns
			return [
				tableName,
				createTable(adapter, tableName, columns),
			]
		}),
	)
}
