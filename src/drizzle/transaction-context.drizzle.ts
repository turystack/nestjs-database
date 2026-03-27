import { AsyncLocalStorage } from 'node:async_hooks'

// biome-ignore lint/suspicious/noExplicitAny: tx type varies per adapter dialect
type AnyTx = any
// biome-ignore lint/suspicious/noExplicitAny: db type varies per adapter dialect
type AnyDb = any

export const transactionStorage = new AsyncLocalStorage<AnyTx>()

export function getCurrentTx(): AnyTx | undefined {
	return transactionStorage.getStore()
}

let _db: AnyDb | undefined

export function registerDb(db: AnyDb): void {
	_db = db
}

export function getDb(): AnyDb {
	if (!_db) {
		throw new Error(
			'[DatabaseModule] db not initialized — was DatabaseModule.register() called?',
		)
	}

	return _db
}
