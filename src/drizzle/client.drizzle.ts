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

export async function createDrizzleClient(
	options: DatabaseModuleOptions,
	schema: Record<string, unknown>,
): Promise<{
	db: unknown
	strategy: AdapterStrategy
}> {
	const { drizzle } = await import('drizzle-orm/node-postgres')
	return {
		db: drizzle(options.postgresql.url, { schema }),
		strategy: new PostgresqlStrategy(),
	}
}
