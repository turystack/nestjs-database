import type { BuildColumns, ColumnBuilderBase, Table } from 'drizzle-orm'
import type {
	PgColumnBuilderBase,
	PgTableWithColumns,
} from 'drizzle-orm/pg-core'
import * as pgCore from 'drizzle-orm/pg-core'

import type {
	ColumnMap,
	PgSchemaBuilder,
	RelationsResolverResult,
	SchemaResolverResult,
} from '@/drizzle/schema-builder.types.drizzle.js'

const tableBuilder = {
	table<TColumns extends Record<string, ColumnBuilderBase>>(
		columns: TColumns,
	): ColumnMap<TColumns> {
		return { __columns: columns }
	},
}

export function createSchemaBuilder(): PgSchemaBuilder {
	const { pgTable: _pgTable, ...pgColumns } = pgCore
	return { ...tableBuilder, ...pgColumns } as PgSchemaBuilder
}

function createTable(
	tableName: string,
	columns: Record<string, unknown>,
): Table {
	return pgCore.pgTable(
		tableName,
		columns as Record<string, pgCore.PgColumnBuilderBase>,
	)
}

type MaterializePg<TResult extends SchemaResolverResult> = {
	[K in keyof TResult & string]: TResult[K] extends ColumnMap<infer C>
		? C extends Record<string, PgColumnBuilderBase>
			? PgTableWithColumns<{
					name: K
					schema: undefined
					columns: BuildColumns<K, C, 'pg'>
					dialect: 'pg'
				}>
			: never
		: never
}

export type MaterializeSchema<TResult extends SchemaResolverResult> =
	MaterializePg<TResult>

export function materializeSchema<TResult extends SchemaResolverResult>(
	resolverResult: TResult,
): MaterializePg<TResult>
export function materializeSchema(
	resolverResult: SchemaResolverResult,
): Record<string, Table> {
	return Object.fromEntries(
		Object.entries(resolverResult).map(([tableName, columnMap]) => [
			tableName,
			createTable(tableName, columnMap.__columns),
		]),
	)
}

export type MaterializeSchemaWithRelations<
	TTableResult extends SchemaResolverResult,
	TRelationsResult extends RelationsResolverResult | undefined,
> = MaterializeSchema<TTableResult> &
	(TRelationsResult extends RelationsResolverResult
		? TRelationsResult
		: Record<string, never>)
