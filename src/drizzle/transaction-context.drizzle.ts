import { AsyncLocalStorage } from 'node:async_hooks'

import type { DatabaseServiceRegistry } from '@/database.types.js'

export const transactionStorage =
	new AsyncLocalStorage<DatabaseServiceRegistry['db']>()

export function getCurrentTx(): DatabaseServiceRegistry['db'] | undefined {
	return transactionStorage.getStore()
}

let _db: DatabaseServiceRegistry['db'] | undefined

export function registerDb(db: DatabaseServiceRegistry['db']): void {
	_db = db
}

export function getDb(): DatabaseServiceRegistry['db'] {
	if (!_db) {
		throw new Error(
			'[DatabaseModule] db not initialized — was DatabaseModule.register() called?',
		)
	}

	return _db
}
