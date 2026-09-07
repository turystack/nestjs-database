import type { BuildColumns, ColumnBuilderBase, Table } from 'drizzle-orm'
import type {
	PgColumnBuilderBase,
	PgTableWithColumns,
} from 'drizzle-orm/pg-core'
import * as pgCore from 'drizzle-orm/pg-core'

import type {
	AnyTableConstraints,
	ColumnMap,
	PgSchemaBuilder,
	RelationsResolverResult,
	SchemaResolverResult,
	TableConstraints,
} from '@/drizzle/schema-builder.types.drizzle.js'

const tableBuilder = {
	table<TColumns extends Record<string, ColumnBuilderBase>>(
		columns: TColumns,
		constraints?: TableConstraints<TColumns>,
	): ColumnMap<TColumns> {
		// The key is only present when there is something to store: the column
		// map is an opaque container, and an always-present `undefined` would
		// show up in every snapshot of it.
		return constraints
			? {
					__columns: columns,
					__constraints: constraints,
				}
			: {
					__columns: columns,
				}
	},
}

export function createSchemaBuilder(): PgSchemaBuilder {
	const { pgTable: _pgTable, ...pgColumns } = pgCore
	return {
		...tableBuilder,
		...pgColumns,
	} as PgSchemaBuilder
}

function createTable(
	tableName: string,
	columns: Record<string, unknown>,
	constraints?: AnyTableConstraints,
): Table {
	// Drizzle's third argument is the only place a unique index, a partial
	// index or a check can be declared. Passing `undefined` for a table that
	// declares none keeps the call identical to what it was before.
	return pgCore.pgTable(
		tableName,
		columns as Record<string, pgCore.PgColumnBuilderBase>,
		constraints as never,
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
			createTable(tableName, columnMap.__columns, columnMap.__constraints),
		]),
	)
}

export type MaterializeSchemaWithRelations<
	TTableResult extends SchemaResolverResult,
	TRelationsResult extends RelationsResolverResult | undefined,
> = TRelationsResult extends RelationsResolverResult
	? MaterializeSchema<TTableResult> & TRelationsResult
	: MaterializeSchema<TTableResult>
