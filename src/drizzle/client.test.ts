import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { createDrizzleClient } from '@/drizzle/client.drizzle.js'

/**
 * The names the database actually sees.
 *
 * A schema is written in camel case because it is TypeScript, and a database is
 * written in snake case because it is SQL. Nothing was translating between
 * them, so a column reached production called `passwordHash` — quoted forever,
 * and unreadable to anyone who opens psql.
 *
 * The client is built against an address nothing listens on: `drizzle` connects
 * lazily, and `toSQL()` compiles the statement without sending it. So this
 * checks the emitted SQL, which is the only place the setting is observable.
 */
const UNREACHABLE = 'postgres://user:password@127.0.0.1:1/nothing'

const users = pgTable('user', {
	passwordHash: text(),
	userId: uuid().primaryKey(),
})

type Selectable = {
	select: () => {
		from: (table: typeof users) => {
			toSQL: () => {
				sql: string
			}
		}
	}
}

describe('createDrizzleClient', () => {
	it('writes column names in snake case', async () => {
		const client = (await createDrizzleClient(
			{
				url: UNREACHABLE,
			},
			{
				users,
			},
		)) as Selectable

		const { sql } = client.select().from(users).toSQL()

		// The names, not the whole statement: the column order follows the key
		// order in the object above, and the formatter sorts those.
		expect(sql).toContain('"user_id"')
		expect(sql).toContain('"password_hash"')
		expect(sql).not.toContain('"userId"')
		expect(sql).not.toContain('"passwordHash"')
	})
})
