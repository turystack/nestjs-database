import type { DatabaseModuleOptions } from '@/database.types.js'

export interface AdapterStrategy {
	runTransaction(
		db: unknown,
		fn: (tx: unknown) => Promise<unknown>,
		isolationLevel?: string,
	): Promise<unknown>
}

class PostgresqlStrategy implements AdapterStrategy {
	async runTransaction(
		db: unknown,
		fn: (tx: unknown) => Promise<unknown>,
		isolationLevel?: string,
	): Promise<unknown> {
		const pgDb = db as { transaction: (fn: (tx: unknown) => Promise<unknown>, config?: { isolationLevel: string }) => Promise<unknown> }
		return pgDb.transaction(
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
		db: unknown,
		fn: (tx: unknown) => Promise<unknown>,
		isolationLevel?: string,
	): Promise<unknown> {
		const mysqlDb = db as { transaction: (fn: (tx: unknown) => Promise<unknown>, config?: { isolationLevel: string }) => Promise<unknown> }
		return mysqlDb.transaction(
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
		db: unknown,
		fn: (tx: unknown) => Promise<unknown>,
		isolationLevel?: string,
	): Promise<unknown> {
		const sqliteDb = db as { transaction: (fn: (tx: unknown) => Promise<unknown>, config?: { behavior: string }) => Promise<unknown> }
		const behavior = isolationLevel as
			| 'deferred'
			| 'immediate'
			| 'exclusive'
			| undefined
		return sqliteDb.transaction(
			fn,
			behavior
				? {
						behavior,
					}
				: undefined,
		)
	}
}

export async function createDrizzleClient(
	options: DatabaseModuleOptions,
	schema: Record<string, unknown>,
): Promise<{
	db: unknown
	strategy: AdapterStrategy
}> {
	switch (options.adapter) {
		case 'postgresql': {
			const { drizzle } = await import('drizzle-orm/node-postgres')
			return {
				db: drizzle(options.postgresql.url, { schema }),
				strategy: new PostgresqlStrategy(),
			}
		}
		case 'mysql': {
			const { drizzle } = await import('drizzle-orm/mysql2')
			return {
				db: drizzle(options.mysql.url, { schema, mode: 'default' }),
				strategy: new MysqlStrategy(),
			}
		}
		case 'sqlite': {
			const { drizzle } = await import('drizzle-orm/better-sqlite3')
			const Database = (await import('better-sqlite3')).default
			return {
				db: drizzle(new Database(options.sqlite.url), { schema }),
				strategy: new SqliteStrategy(),
			}
		}
	}
}
