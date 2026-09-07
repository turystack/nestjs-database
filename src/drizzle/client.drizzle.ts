import type { DatabaseOptions } from '@/database.types.js'

export async function createDrizzleClient(
	options: DatabaseOptions,
	schema: Record<string, unknown>,
): Promise<unknown> {
	const { drizzle } = await import('drizzle-orm/node-postgres')
	return drizzle(options.url, {
		schema,
	})
}
