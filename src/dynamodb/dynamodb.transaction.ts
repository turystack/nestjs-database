import type { ITransactionStrategy } from '@/database.adapter.interface.js'
import type { TransactionOptions } from '@/database.types.js'

import type { DynamoConnection } from '@/dynamodb/client.dynamodb.js'

/** DynamoDB's own ceiling for one atomic write. */
const TRANSACT_WRITE_MAX_ITEMS = 100

/**
 * What a repository call reads.
 *
 * Outside a transaction it is the connection. Inside one it is the connection
 * plus `enqueue`, and the presence of that function is how a repository knows
 * to buffer instead of send.
 */
export type DynamoHandle = DynamoConnection & {
	enqueue?: (item: Record<string, unknown>) => void
}

/**
 * A transaction here is a batch assembled and sent once, not a handle held open.
 *
 * The engine has no open handle to write through: `TransactWriteItems` is a
 * single atomic call built up front. So the writes are collected during the
 * operation and flushed before the decorator returns, which is the same shape
 * the transactional outbox already used.
 *
 * Three things do not survive that translation, and each one refuses loudly
 * rather than approximating:
 *
 * - **Reads do not see the buffered writes.** A read inside the operation goes
 *   to the connection and returns what is stored, not what is pending. The
 *   repository's `updateById` and `deleteById` refuse inside a transaction for
 *   the same reason: their contract is to return the resulting item, and there
 *   is none until the flush.
 * - **The batch has a ceiling.** A hundred items, and no item written twice.
 *   Past it, the flush fails rather than splitting into batches that would no
 *   longer be atomic.
 * - **Isolation level has no meaning.** Passing one is an error, not a silently
 *   ignored argument.
 */
export const dynamoTransaction: ITransactionStrategy = {
	async run<TResult>(
		client: unknown,
		work: (handle: unknown) => Promise<TResult>,
		options?: TransactionOptions,
	): Promise<TResult> {
		if (options?.isolationLevel) {
			throw new Error(
				`[DatabaseModule] adapter "dynamodb" has no isolation levels — @Transactional('${options.isolationLevel}') cannot be honoured here, and ignoring it would be worse than refusing it`,
			)
		}

		const connection = client as DynamoConnection
		const items: Record<string, unknown>[] = []

		const handle: DynamoHandle = {
			...connection,
			enqueue: (item) => {
				items.push(item)
			},
		}

		const result = await work(handle)

		if (items.length === 0) {
			return result
		}

		if (items.length > TRANSACT_WRITE_MAX_ITEMS) {
			throw new Error(
				`[DatabaseModule] a transaction collected ${items.length} writes, over DynamoDB's limit of ${TRANSACT_WRITE_MAX_ITEMS}. Splitting it would stop being atomic, so it is refused instead.`,
			)
		}

		await connection.client.send(
			new connection.sdk.TransactWriteCommand({
				TransactItems: items,
			}),
		)

		return result
	},
}
