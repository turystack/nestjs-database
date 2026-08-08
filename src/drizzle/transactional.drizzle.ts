import {
	type AfterCommitHook,
	afterCommitStorage,
	type BeforeCommitHook,
	beforeCommitStorage,
	getCurrentTx,
	getDb,
	transactionStateStorage,
	transactionStorage,
} from '@/drizzle/transaction-context.drizzle.js'

export type IsolationLevel =
	| 'read uncommitted'
	| 'read committed'
	| 'repeatable read'
	| 'serializable'

export function Transactional(isolationLevel?: IsolationLevel) {
	return (
		_target: object,
		_propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	): PropertyDescriptor => {
		const original = descriptor.value as (
			...args: unknown[]
		) => Promise<unknown>

		descriptor.value = async function (this: unknown, ...args: unknown[]) {
			if (getCurrentTx() !== undefined) {
				return original.apply(this, args)
			}

			const db = getDb() as {
				transaction: (
					fn: (tx: unknown) => Promise<unknown>,
					config?: {
						isolationLevel?: string
					},
				) => Promise<unknown>
			}

			const before: BeforeCommitHook[] = []
			const after: AfterCommitHook[] = []

			const state = new Map<symbol, unknown>()

			const run = async (tx: unknown): Promise<unknown> => {
				const value = await original.apply(this, args)

				// Drained here, not after the transaction returns: the hook has to
				// write on the same handle so a rollback discards it too.
				for (const hook of before) {
					await hook(tx as never)
				}

				return value
			}

			const result = await db.transaction(
				(tx: unknown) =>
					transactionStorage.run(tx, () =>
						transactionStateStorage.run(state, () =>
							beforeCommitStorage.run(before, () =>
								afterCommitStorage.run(after, () => run(tx)),
							),
						),
					),
				isolationLevel
					? {
							isolationLevel,
						}
					: undefined,
			)

			// The data is durable at this point. A hook failing here cannot undo
			// that, so it must not turn a committed operation into a thrown error.
			for (const hook of after) {
				try {
					await hook()
				} catch {
					// Intentionally swallowed — see above.
				}
			}

			return result
		}

		return descriptor
	}
}
