import type { DatabaseOptions } from '@/database.types.js'

export async function createDrizzleClient(
	options: DatabaseOptions,
	schema: Record<string, unknown>,
): Promise<unknown> {
	const { drizzle } = await import('drizzle-orm/node-postgres')
	return drizzle(options.url, {
		// The schema is written in camel case because it is TypeScript; the
		// database is written in snake case because it is SQL. Without this the
		// two were the same string, and a column arrived in production called
		// `passwordHash` — quoted forever, and unreadable to anyone opening psql.
		//
		// `drizzle.config.ts` carries the same setting, or the migrations
		// drizzle-kit generates would name the columns the other way.
		casing: 'snake_case',
		schema,
	})
}
