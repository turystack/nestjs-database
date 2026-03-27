import type { DatabaseModuleOptions } from '@/database.types.js'

// biome-ignore lint/suspicious/noExplicitAny: db/tx types vary per dialect
type AnyDb = any
// biome-ignore lint/suspicious/noExplicitAny: tx types vary per dialect
type AnyTx = any

export interface AdapterStrategy {
	runTransaction(
		db: AnyDb,
		fn: (tx: AnyTx) => Promise<unknown>,
		isolationLevel?: string,
	): Promise<unknown>
}

class PostgresqlStrategy implements AdapterStrategy {
	async runTransaction(
		db: AnyDb,
		fn: (tx: AnyTx) => Promise<unknown>,
		isolationLevel?: string,
	): Promise<unknown> {
		return db.transaction(
			fn,
			isolationLevel
				? {
						isolationLevel,
					}
				: undefined,
		)
	}
}

class MysqlStrategy implements AdapterStrategy {
	async runTransaction(
		db: AnyDb,
		fn: (tx: AnyTx) => Promise<unknown>,
		isolationLevel?: string,
	): Promise<unknown> {
		return db.transaction(
			fn,
			isolationLevel
				? {
						isolationLevel,
					}
				: undefined,
		)
	}
}

class SqliteStrategy implements AdapterStrategy {
	async runTransaction(
		db: AnyDb,
		fn: (tx: AnyTx) => Promise<unknown>,
		isolationLevel?: string,
	): Promise<unknown> {
		// SQLite uses behavior instead of isolationLevel
		const behavior = isolationLevel as
			| 'deferred'
			| 'immediate'
			| 'exclusive'
			| undefined
		return db.transaction(
			fn,
			behavior
				? {
						behavior,
					}
				: undefined,
		)
	}
}

export function createDrizzleClient(options: DatabaseModuleOptions): {
	db: AnyDb
	strategy: AdapterStrategy
} {
	switch (options.adapter) {
		case 'postgresql': {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic require avoids compile-time peer dep
			const { drizzle } = require('drizzle-orm/node-postgres') as any
			return {
				db: drizzle(options.postgresql.url),
				strategy: new PostgresqlStrategy(),
			}
		}
		case 'mysql': {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic require avoids compile-time peer dep
			const { drizzle } = require('drizzle-orm/mysql2') as any
			return {
				db: drizzle(options.mysql.url),
				strategy: new MysqlStrategy(),
			}
		}
		case 'sqlite': {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic require avoids compile-time peer dep
			const { drizzle } = require('drizzle-orm/better-sqlite3') as any
			// biome-ignore lint/suspicious/noExplicitAny: dynamic require avoids compile-time peer dep
			const Database = require('better-sqlite3') as any
			return {
				db: drizzle(new Database(options.sqlite.url)),
				strategy: new SqliteStrategy(),
			}
		}
	}
}
