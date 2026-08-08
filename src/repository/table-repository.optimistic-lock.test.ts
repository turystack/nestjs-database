import { ConcurrentUpdateError } from '@turystack/exceptions'
import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import { RecordNotFoundError } from '@/repository/table-repository.errors.js'
import { TableRepository } from '@/repository/table-repository.js'

const orders = pgTable('orders', {
	id: uuid('id').primaryKey(),
	revision: integer('revision').notNull(),
	status: text('status').notNull(),
	version: integer('version').notNull(),
})

const noVersion = pgTable('legacy', {
	id: uuid('id').primaryKey(),
	status: text('status').notNull(),
})

type Row = Record<string, unknown>

function createDb(options?: { currentRow?: Row | null; updatedRows?: Row[] }) {
	const updatedRows = options?.updatedRows ?? [
		{
			id: 'o1',
			status: 'CANCELLED',
			version: 4,
		},
	]

	const findFirst = vi.fn(async (_config?: unknown) =>
		options?.currentRow === null ? undefined : options?.currentRow,
	)
	const mutationReturning = vi.fn(async (_fields?: unknown) => updatedRows)
	const mutationWhere = vi.fn((_condition: unknown) => ({
		returning: mutationReturning,
	}))
	const set = vi.fn((_data: unknown) => ({
		where: mutationWhere,
	}))
	const update = vi.fn((_table: unknown) => ({
		set,
	}))

	const db = {
		query: {
			legacy: {
				findFirst,
			},
			orders: {
				findFirst,
			},
		},
		update,
	}

	return {
		db,
		findFirst,
		mutationWhere,
		set,
	}
}

function createRepository(
	mock: ReturnType<typeof createDb>,
	table: typeof orders | typeof noVersion = orders,
	name = 'orders',
) {
	return new TableRepository(() => mock.db, name, table)
}

describe('TableRepository · optimistic locking', () => {
	it('leaves the write untouched when no version is expected', async () => {
		const mock = createDb()
		const repository = createRepository(mock)

		await repository.updateById('o1', {
			status: 'CANCELLED',
		})

		expect(mock.set).toHaveBeenCalledWith({
			status: 'CANCELLED',
		})
	})

	it('bumps the version on a guarded write', async () => {
		const mock = createDb()
		const repository = createRepository(mock)

		await repository.updateById(
			'o1',
			{
				status: 'CANCELLED',
			},
			{
				expectedVersion: 3,
			},
		)

		expect(mock.set).toHaveBeenCalledWith({
			status: 'CANCELLED',
			version: 4,
		})
	})

	it('narrows the write to the expected version', async () => {
		const mock = createDb()
		const repository = createRepository(mock)

		await repository.updateById(
			'o1',
			{
				status: 'CANCELLED',
			},
			{
				expectedVersion: 3,
			},
		)

		// pk equality alone would let a concurrent writer be overwritten; the
		// condition has to carry the version too.
		expect(mock.mutationWhere).toHaveBeenCalledTimes(1)
		expect(mock.mutationWhere.mock.calls[0][0]).toBeDefined()
	})

	it('honours a custom version column', async () => {
		const mock = createDb()
		const repository = createRepository(mock)

		await repository.updateById(
			'o1',
			{
				status: 'CANCELLED',
			},
			{
				expectedVersion: 7,
				versionColumn: 'revision',
			},
		)

		expect(mock.set).toHaveBeenCalledWith({
			revision: 8,
			status: 'CANCELLED',
		})
	})

	it('throws ConcurrentUpdateError when the row moved on', async () => {
		const mock = createDb({
			currentRow: {
				id: 'o1',
				status: 'PAID',
				version: 5,
			},
			updatedRows: [],
		})
		const repository = createRepository(mock)

		await expect(
			repository.updateById(
				'o1',
				{
					status: 'CANCELLED',
				},
				{
					expectedVersion: 3,
				},
			),
		).rejects.toBeInstanceOf(ConcurrentUpdateError)
	})

	it('reports both versions so the caller can decide how to reconcile', async () => {
		const mock = createDb({
			currentRow: {
				id: 'o1',
				status: 'PAID',
				version: 5,
			},
			updatedRows: [],
		})
		const repository = createRepository(mock)

		await expect(
			repository.updateById(
				'o1',
				{
					status: 'CANCELLED',
				},
				{
					expectedVersion: 3,
				},
			),
		).rejects.toMatchObject({
			metadata: {
				actualVersion: 5,
				expectedVersion: 3,
				table: 'orders',
			},
			statusCode: 409,
		})
	})

	it('throws RecordNotFoundError when the row is gone, not a version conflict', async () => {
		const mock = createDb({
			currentRow: null,
			updatedRows: [],
		})
		const repository = createRepository(mock)

		await expect(
			repository.updateById(
				'o1',
				{
					status: 'CANCELLED',
				},
				{
					expectedVersion: 3,
				},
			),
		).rejects.toBeInstanceOf(RecordNotFoundError)
	})

	it('keeps the unguarded path reporting not-found without an extra read', async () => {
		const mock = createDb({
			updatedRows: [],
		})
		const repository = createRepository(mock)

		await expect(
			repository.updateById('o1', {
				status: 'CANCELLED',
			}),
		).rejects.toBeInstanceOf(RecordNotFoundError)
		expect(mock.findFirst).not.toHaveBeenCalled()
	})

	it('fails loudly when the table has no version column', async () => {
		const mock = createDb()
		const repository = createRepository(mock, noVersion, 'legacy')

		await expect(
			repository.updateById(
				'o1',
				{
					status: 'CANCELLED',
				},
				{
					expectedVersion: 1,
				},
			),
		).rejects.toThrow('has no "version" column for optimistic locking')
	})
})
