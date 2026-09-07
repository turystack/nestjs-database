import { relations as drizzleRelations, type Table } from 'drizzle-orm'

import type {
	IDatabaseAdapter,
	ITransactionStrategy,
} from '@/database.adapter.interface.js'
import type {
	PostgresqlModuleOptions,
	TransactionOptions,
} from '@/database.types.js'

import { createDrizzleClient } from '@/drizzle/client.drizzle.js'
import {
	createSchemaBuilder,
	materializeSchema,
} from '@/drizzle/schema-builder.drizzle.js'
import { TableRepository } from '@/repository/table-repository.js'

/** The shape of the Drizzle client this adapter needs, and nothing more. */
type DrizzleClient = {
	transaction: (
		fn: (tx: unknown) => Promise<unknown>,
		config?: {
			isolationLevel?: string
		},
	) => Promise<unknown>
}

/**
 * Postgres opens a real handle, so the strategy is a passthrough: the callback
 * receives the transaction object and every repository call inside the tree
 * reads it in place of the client.
 */
const transaction: ITransactionStrategy = {
	async run<TResult>(
		client: unknown,
		work: (handle: unknown) => Promise<TResult>,
		options?: TransactionOptions,
	): Promise<TResult> {
		const db = client as DrizzleClient

		return (await db.transaction(
			(tx) => work(tx) as Promise<unknown>,
			options?.isolationLevel
				? {
						isolationLevel: options.isolationLevel,
					}
				: undefined,
		)) as TResult
	},
}

/**
 * The PostgreSQL engine, behind the port.
 *
 * Everything here was already in `database.module.ts`; the move is what lets a
 * second engine exist without editing the factory that serves this one.
 */
export function createPostgresqlAdapter(
	options: PostgresqlModuleOptions,
): IDatabaseAdapter {
	return {
		createRepository({ getClient, table, tableName }) {
			return new TableRepository(getClient, tableName, table as Table)
		},

		async initialize() {
			const tables = materializeSchema(
				options.schemaResolver(createSchemaBuilder()),
			)

			let schema: Record<string, unknown> = {
				...tables,
			}

			if (options.relationsResolver) {
				const resolved = options.relationsResolver(tables as never, {
					relations: drizzleRelations,
				}) as Record<string, unknown>

				schema = {
					...tables,
					...resolved,
				}
			}

			return {
				client: await createDrizzleClient(options.postgresql, schema),
				tables,
			}
		},

		transaction,
	}
}
