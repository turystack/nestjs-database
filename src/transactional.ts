import type { IsolationLevel, TransactionOptions } from '@/database.types.js'
import {
	type AfterCommitHook,
	afterCommitStorage,
	type BeforeCommitHook,
	beforeCommitStorage,
	getCurrentTx,
	getEngine,
	transactionStateStorage,
	transactionStorage,
} from '@/transaction.context.js'

export type { IsolationLevel } from '@/database.types.js'

/**
 * Runs the method inside one transaction.
 *
 * The propagation is "join or start": a call that already has a transaction in
 * flight reuses it, so a use case calling another use case commits once. There
 * are no savepoints and no `REQUIRES_NEW`.
 *
 * What a transaction *is* belongs to the engine, not here — this asks the
 * registered adapter's strategy to run the work, so an engine that assembles an
 * atomic batch instead of holding an open handle needs no change on this side.
 *
 * `isolationLevel` is honoured by engines that have one and refused by engines
 * that do not, at registration rather than silently.
 */
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

			const engine = getEngine()

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

			const options: TransactionOptions | undefined = isolationLevel
				? {
						isolationLevel,
					}
				: undefined

			const result = await engine.adapter.transaction.run(
				engine.client,
				(tx: unknown) =>
					transactionStorage.run(tx, () =>
						transactionStateStorage.run(state, () =>
							beforeCommitStorage.run(before, () =>
								afterCommitStorage.run(after, () => run(tx)),
							),
						),
					),
				options,
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
