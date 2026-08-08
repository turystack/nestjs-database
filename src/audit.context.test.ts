import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { registerAuditActor } from '@/audit.context.js'

import { TableRepository } from '@/repository/table-repository.js'

const audited = pgTable('orders', {
	createdBy: text('created_by'),
	id: uuid('id').primaryKey(),
	status: text('status').notNull(),
	updatedBy: text('updated_by'),
})

const plain = pgTable('legacy', {
	id: uuid('id').primaryKey(),
	status: text('status').notNull(),
})

function createDb() {
	const returning = vi.fn(async () => [
		{
			id: 'o1',
		},
	])
	const values = vi.fn(() => ({
		returning,
	}))
	const insert = vi.fn(() => ({
		values,
	}))
	const mutationWhere = vi.fn(() => ({
		returning,
	}))
	const set = vi.fn(() => ({
		where: mutationWhere,
	}))
	const update = vi.fn(() => ({
		set,
	}))

	return {
		db: {
			insert,
			query: {
				legacy: {
					findFirst: vi.fn(),
				},
				orders: {
					findFirst: vi.fn(),
				},
			},
			update,
		},
		insert,
		set,
		values,
	}
}

afterEach(() => {
	registerAuditActor(undefined)
})

describe('audit stamping', () => {
	it('stamps createdBy from the acting principal', async () => {
		registerAuditActor(() => 'user-9')
		const mock = createDb()
		const repository = new TableRepository(() => mock.db, 'orders', audited)

		await repository.create({
			id: 'o1',
			status: 'NEW',
		})

		expect(mock.values).toHaveBeenCalledWith(
			expect.objectContaining({
				createdBy: 'user-9',
			}),
		)
	})

	it('stamps updatedBy from the acting principal', async () => {
		registerAuditActor(() => 'user-9')
		const mock = createDb()
		const repository = new TableRepository(() => mock.db, 'orders', audited)

		await repository.updateById('o1', {
			status: 'CANCELLED',
		})

		expect(mock.set).toHaveBeenCalledWith(
			expect.objectContaining({
				updatedBy: 'user-9',
			}),
		)
	})

	it('stamps every row of a bulk insert', async () => {
		registerAuditActor(() => 'user-9')
		const mock = createDb()
		const repository = new TableRepository(() => mock.db, 'orders', audited)

		await repository.createMany([
			{
				id: 'o1',
				status: 'NEW',
			},
			{
				id: 'o2',
				status: 'NEW',
			},
		])

		const [[rows]] = mock.values.mock.calls as unknown as [
			[
				{
					createdBy: string
				}[],
			],
		]
		expect(rows.every((row) => row.createdBy === 'user-9')).toBe(true)
	})

	it('lets an explicit value win — the caller is more specific', async () => {
		registerAuditActor(() => 'ambient')
		const mock = createDb()
		const repository = new TableRepository(() => mock.db, 'orders', audited)

		await repository.create({
			createdBy: 'explicit',
			id: 'o1',
			status: 'NEW',
		})

		expect(mock.values).toHaveBeenCalledWith(
			expect.objectContaining({
				createdBy: 'explicit',
			}),
		)
	})

	it('leaves a table without audit columns untouched', async () => {
		registerAuditActor(() => 'user-9')
		const mock = createDb()
		const repository = new TableRepository(() => mock.db, 'legacy', plain)

		await repository.create({
			id: 'o1',
			status: 'NEW',
		})

		expect(mock.values).toHaveBeenCalledWith(
			expect.not.objectContaining({
				createdBy: expect.anything(),
			}),
		)
	})

	it('writes nothing when there is no acting principal', async () => {
		const mock = createDb()
		const repository = new TableRepository(() => mock.db, 'orders', audited)

		await repository.create({
			id: 'o1',
			status: 'NEW',
		})

		expect(mock.values).toHaveBeenCalledWith(
			expect.not.objectContaining({
				createdBy: expect.anything(),
			}),
		)
	})

	it('writes nothing for an unauthenticated operation', async () => {
		registerAuditActor(() => undefined)
		const mock = createDb()
		const repository = new TableRepository(() => mock.db, 'orders', audited)

		await repository.create({
			id: 'o1',
			status: 'NEW',
		})

		expect(mock.values).toHaveBeenCalledWith(
			expect.not.objectContaining({
				createdBy: expect.anything(),
			}),
		)
	})
})
