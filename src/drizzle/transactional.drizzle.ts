import {
	getCurrentTx,
	getDb,
	transactionStorage,
} from '@/drizzle/transaction-context.drizzle.js'

export type IsolationLevel =
	| 'read uncommitted'
	| 'read committed'
	| 'repeatable read'
	| 'serializable'
	| 'deferred'
	| 'immediate'
	| 'exclusive'

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

			const db = getDb()

			return db.transaction(
				(tx: unknown) =>
					transactionStorage.run(tx, () => original.apply(this, args)),
				isolationLevel
					? {
							isolationLevel,
						}
					: undefined,
			)
		}

		return descriptor
	}
}
