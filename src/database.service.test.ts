import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import { DatabaseService } from '@/database.service.js'
import { transactionStorage } from '@/transaction.context.js'

import { createPostgresqlAdapter } from '@/drizzle/postgresql.adapter.js'
import { TableRepository } from '@/repository/table-repository.js'

const adapter = createPostgresqlAdapter({
	adapter: 'postgresql',
	postgresql: {
		url: 'postgres://unused',
	},
	schemaResolver: () => ({}),
})

const users = pgTable('users', {
	id: uuid('id').primaryKey(),
	name: text('name').notNull(),
})

function createService() {
	const findMany = vi.fn(async (_config?: unknown) => [])
	const db = {
		query: {
			users: {
				findMany,
			},
		},
	}
	const service = new DatabaseService(adapter, db, {
		users,
	}) as DatabaseService & {
		users: TableRepository
	}
	return {
		db,
		findMany,
		service,
	}
}

describe('DatabaseService', () => {
	it('should route repository calls through the raw db', async () => {
		const { findMany, service } = createService()

		await service.users.findMany()

		expect(service.users).toBeInstanceOf(TableRepository)
		expect(findMany).toHaveBeenCalledTimes(1)
	})

	it('should prefer the active transaction over the root db', () => {
		const { db, service } = createService()
		const txDb = {
			tx: true,
		}

		expect(service.raw).toBe(db)
		transactionStorage.run(txDb as never, () => {
			expect(service.raw).toBe(txDb)
		})
	})

	it('should reject schema tables that clash with service members', () => {
		expect(
			() =>
				new DatabaseService(
					adapter,
					{},
					{
						raw: users,
					},
				),
		).toThrow('table name "raw" is reserved by DatabaseService')
	})
})
