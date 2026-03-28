import { AsyncLocalStorage } from 'node:async_hooks'

import type { ResolvedDatabase } from '@/database.types.js'

export const transactionStorage =
	new AsyncLocalStorage<ResolvedDatabase>()

export function getCurrentTx(): ResolvedDatabase | undefined {
	return transactionStorage.getStore()
}

let _db: ResolvedDatabase | undefined

export function registerDb(db: ResolvedDatabase): void {
	_db = db
}

export function getDb(): ResolvedDatabase {
	if (!_db) {
		throw new Error(
			'[DatabaseModule] db not initialized — was DatabaseModule.register() called?',
		)
	}

	return _db
}
