import type { IDatabaseAdapter } from '@/database.adapter.interface.js'
import type { DynamodbModuleOptions } from '@/database.types.js'

import { createDynamoConnection } from '@/dynamodb/client.dynamodb.js'
import { DynamoRepository } from '@/dynamodb/dynamodb.repository.js'
import type { DynamoHandle } from '@/dynamodb/dynamodb.transaction.js'
import { dynamoTransaction } from '@/dynamodb/dynamodb.transaction.js'
import {
	createDynamoSchemaBuilder,
	materializeDynamoSchema,
} from '@/dynamodb/schema-builder.dynamodb.js'
import type {
	DynamoSchemaResolverResult,
	DynamoTable,
} from '@/dynamodb/schema-builder.types.dynamodb.js'

/**
 * The DynamoDB engine, behind the port.
 *
 * It answers the same three questions the PostgreSQL adapter does, and hands
 * back repositories whose surface is smaller on purpose — see
 * `dynamodb.repository.types.ts` for what is absent and why.
 */
export function createDynamodbAdapter(
	options: DynamodbModuleOptions,
): IDatabaseAdapter {
	return {
		createRepository({ getClient, table }) {
			return new DynamoRepository(
				() => getClient() as DynamoHandle,
				table as DynamoTable,
			)
		},

		async initialize() {
			const tables = materializeDynamoSchema(
				options.schemaResolver(
					createDynamoSchemaBuilder(),
				) as DynamoSchemaResolverResult,
			)

			return {
				client: await createDynamoConnection(options.dynamodb),
				tables,
			}
		},

		transaction: dynamoTransaction,
	}
}
