import type { DatabaseModuleOptions } from '@/database.types.js'

export async function createDrizzleClient(
	options: DatabaseModuleOptions,
	schema: Record<string, unknown>,
): Promise<unknown> {
	const { drizzle } = await import('drizzle-orm/node-postgres')
	return drizzle(options.postgresql.url, {
		schema,
	})
}
