import { AsyncLocalStorage } from 'node:async_hooks'

export const transactionStorage = new AsyncLocalStorage<unknown>()

export function getCurrentTx(): unknown | undefined {
	return transactionStorage.getStore()
}

let _db: unknown | undefined

export function registerDb(db: unknown): void {
	_db = db
}

export function getDb(): unknown {
	if (!_db) {
		throw new Error(
			'[DatabaseModule] db not initialized — was DatabaseModule.register() called?',
		)
	}

	return _db
}
