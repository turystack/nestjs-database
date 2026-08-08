import { sql } from 'drizzle-orm'
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import {
	RecordNotCreatedError,
	RecordNotFoundError,
} from '@/repository/table-repository.errors.js'
import { TableRepository } from '@/repository/table-repository.js'
import type { WhereOperators } from '@/repository/table-repository.types.js'

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const users = pgTable('users', {
	id: uuid('id').primaryKey(),
	name: text('name').notNull(),
})

type Row = Record<string, unknown>

type SelectChainMock = Promise<Row[]> & {
	limit: (n: number) => SelectChainMock
	where: (condition: unknown) => SelectChainMock
}

function createDb(options?: {
	firstRow?: Row | null
	returningRows?: Row[]
	selectRows?: Row[]
}) {
	const returningRows = options?.returningRows ?? [
		{
			id: 'u1',
			name: 'Ana',
		},
	]
	const selectRows = options?.selectRows ?? [
		{
			count: 2,
		},
	]

	const findFirst = vi.fn(
		async (_config?: unknown) => options?.firstRow ?? undefined,
	)
	const findMany = vi.fn(async (_config?: unknown) => returningRows)

	const insertReturning = vi.fn(async (_fields?: unknown) => returningRows)
	const insertChain: Record<string, unknown> = {
		returning: insertReturning,
	}
	const onConflictDoUpdate = vi.fn((_opts: unknown) => insertChain)
	insertChain.onConflictDoUpdate = onConflictDoUpdate
	const values = vi.fn((_data: unknown) => insertChain)
	const insert = vi.fn((_table: unknown) => ({
		values,
	}))

	const mutationReturning = vi.fn(async (_fields?: unknown) => returningRows)
	const mutationWhere = vi.fn((_condition: unknown) => ({
		returning: mutationReturning,
	}))
	const set = vi.fn((_data: unknown) => ({
		where: mutationWhere,
	}))
	const update = vi.fn((_table: unknown) => ({
		set,
	}))
	const deleteFn = vi.fn((_table: unknown) => ({
		where: mutationWhere,
	}))

	const selectChain = Promise.resolve(selectRows) as SelectChainMock
	selectChain.where = vi.fn((_condition: unknown) => selectChain)
	selectChain.limit = vi.fn((_n: number) => selectChain)
	const from = vi.fn((_table: unknown) => selectChain)
	const select = vi.fn((_fields: unknown) => ({
		from,
	}))

	const db = {
		delete: deleteFn,
		insert,
		query: {
			users: {
				findFirst,
				findMany,
			},
		},
		select,
		update,
	}

	return {
		db,
		deleteFn,
		findFirst,
		findMany,
		insert,
		insertReturning,
		mutationReturning,
		mutationWhere,
		onConflictDoUpdate,
		select,
		selectChain,
		set,
		update,
		values,
	}
}

function createRepository(mock: ReturnType<typeof createDb>) {
	return new TableRepository(() => mock.db, 'users', users)
}

describe('TableRepository', () => {
	describe('constructor', () => {
		it('should throw when the table has no primary key', () => {
			const noPk = pgTable('no_pk', {
				name: text('name'),
			})

			expect(() => new TableRepository(() => ({}), 'no_pk', noPk)).toThrow(
				'table "no_pk" has no primary key',
			)
		})
	})

	describe('queries', () => {
		it('should delegate findMany to the drizzle query API', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			const config = {
				limit: 10,
			}
			const result = await repository.findMany(config)

			expect(mock.findMany).toHaveBeenCalledWith(config)
			expect(result).toHaveLength(1)
		})

		it('should delegate findFirst to the drizzle query API', async () => {
			const mock = createDb({
				firstRow: {
					id: 'u1',
				},
			})
			const repository = createRepository(mock)

			const result = await repository.findFirst()

			expect(mock.findFirst).toHaveBeenCalledWith(undefined)
			expect(result).toEqual({
				id: 'u1',
			})
		})

		it('should resolve findById through findFirst with a pk condition', async () => {
			const mock = createDb({
				firstRow: {
					id: 'u1',
				},
			})
			const repository = createRepository(mock)

			const result = await repository.findById('u1', {
				columns: {
					id: true,
				},
			})

			expect(result).toEqual({
				id: 'u1',
			})
			const config = mock.findFirst.mock.calls[0][0] as Row
			expect(config.where).toBeDefined()
			expect(config.columns).toEqual({
				id: true,
			})
		})

		it('should count rows without a where condition', async () => {
			const mock = createDb({
				selectRows: [
					{
						count: 5,
					},
				],
			})
			const repository = createRepository(mock)

			const result = await repository.count()

			expect(result).toBe(5)
			expect(mock.selectChain.where).not.toHaveBeenCalled()
		})

		it('should count rows with a where callback', async () => {
			const mock = createDb({
				selectRows: [
					{
						count: 3,
					},
				],
			})
			const repository = createRepository(mock)

			const result = await repository.count({
				where: (fields: Row, { eq }: WhereOperators) =>
					eq(fields.name as never, 'Ana'),
			})

			expect(result).toBe(3)
			expect(mock.selectChain.where).toHaveBeenCalledTimes(1)
		})

		it('should return true from exists when a row matches', async () => {
			const mock = createDb({
				selectRows: [
					{
						_: 1,
					},
				],
			})
			const repository = createRepository(mock)

			const result = await repository.exists({
				where: (fields: Row, { eq }: WhereOperators) =>
					eq(fields.name as never, 'Ana'),
			})

			expect(result).toBe(true)
			expect(mock.selectChain.limit).toHaveBeenCalledWith(1)
		})

		it('should return false from exists when no row matches', async () => {
			const mock = createDb({
				selectRows: [],
			})
			const repository = createRepository(mock)

			const result = await repository.exists({
				where: sql`1 = 1`,
			})

			expect(result).toBe(false)
		})

		it('should throw when exists is called without a resolvable condition', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			await expect(
				repository.exists({
					where: () => undefined,
				}),
			).rejects.toThrow('where condition is required for exists')
		})
	})

	describe('create', () => {
		it('should auto-generate the primary key when missing', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			await repository.create({
				name: 'Ana',
			})

			const inserted = mock.values.mock.calls[0][0] as Row
			expect(inserted.name).toBe('Ana')
			expect(inserted.id).toMatch(UUID_PATTERN)
		})

		it('should keep a caller-provided primary key', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			await repository.create({
				id: 'custom-id',
				name: 'Ana',
			})

			const inserted = mock.values.mock.calls[0][0] as Row
			expect(inserted.id).toBe('custom-id')
		})

		it('should not auto-generate when the pk column has a default', async () => {
			const withDefault = pgTable('with_default', {
				id: uuid('id').defaultRandom().primaryKey(),
				name: text('name'),
			})
			const mock = createDb()
			const repository = new TableRepository(
				() => mock.db,
				'with_default',
				withDefault,
			)

			await repository.create({
				name: 'Ana',
			})

			const inserted = mock.values.mock.calls[0][0] as Row
			expect(inserted.id).toBeUndefined()
		})

		it('should map returning columns to drizzle column refs', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			await repository.create(
				{
					name: 'Ana',
				},
				{
					returning: {
						id: true,
						name: false,
					},
				},
			)

			const returningArg = mock.insertReturning.mock.calls[0][0] as Row
			expect(Object.keys(returningArg)).toEqual([
				'id',
			])
		})

		it('should return the first inserted row', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			const result = await repository.create({
				name: 'Ana',
			})

			expect(result).toEqual({
				id: 'u1',
				name: 'Ana',
			})
		})

		it('should throw when the insert returns no rows', async () => {
			const mock = createDb({
				returningRows: [],
			})
			const repository = createRepository(mock)

			await expect(
				repository.create({
					name: 'Ana',
				}),
			).rejects.toThrow(RecordNotCreatedError)
		})

		it('should refetch with relations when the with option is set', async () => {
			const mock = createDb({
				firstRow: {
					id: 'u1',
					posts: [],
				},
			})
			const repository = createRepository(mock)

			const result = await repository.create(
				{
					name: 'Ana',
				},
				{
					with: {
						posts: true,
					},
				},
			)

			expect(result).toEqual({
				id: 'u1',
				posts: [],
			})
			const config = mock.findFirst.mock.calls[0][0] as Row
			expect(config.with).toEqual({
				posts: true,
			})
		})

		it('should throw when the refetch after create finds nothing', async () => {
			const mock = createDb({
				firstRow: null,
			})
			const repository = createRepository(mock)

			await expect(
				repository.create(
					{
						name: 'Ana',
					},
					{
						with: {
							posts: true,
						},
					},
				),
			).rejects.toThrow(RecordNotCreatedError)
		})

		it('should create many rows with generated pks', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			await repository.createMany([
				{
					name: 'Ana',
				},
				{
					name: 'Bia',
				},
			])

			const inserted = mock.values.mock.calls[0][0] as Row[]
			expect(inserted).toHaveLength(2)
			expect(inserted[0].id).toMatch(UUID_PATTERN)
			expect(inserted[1].id).toMatch(UUID_PATTERN)
		})

		it('should map returning columns for createMany', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			await repository.createMany(
				[
					{
						name: 'Ana',
					},
				],
				{
					returning: {
						name: true,
					},
				},
			)

			const returningArg = mock.insertReturning.mock.calls[0][0] as Row
			expect(Object.keys(returningArg)).toEqual([
				'name',
			])
		})
	})

	describe('update', () => {
		it('should update rows matching a where callback', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			const result = await repository.update({
				data: {
					name: 'Bia',
				},
				where: (fields: Row, { eq }: WhereOperators) =>
					eq(fields.id as never, 'u1'),
			})

			expect(mock.set).toHaveBeenCalledWith({
				name: 'Bia',
			})
			expect(mock.mutationWhere).toHaveBeenCalledTimes(1)
			expect(result).toHaveLength(1)
		})

		it('should throw when update has no resolvable condition', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			await expect(
				repository.update({
					data: {
						name: 'Bia',
					},
					where: () => undefined,
				}),
			).rejects.toThrow('where condition is required for update')
		})

		it('should map returning columns for update', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			await repository.update({
				data: {
					name: 'Bia',
				},
				returning: {
					id: true,
				},
				where: sql`1 = 1`,
			})

			const returningArg = mock.mutationReturning.mock.calls[0][0] as Row
			expect(Object.keys(returningArg)).toEqual([
				'id',
			])
		})

		it('should update by id and return the first row', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			const result = await repository.updateById('u1', {
				name: 'Bia',
			})

			expect(result).toEqual({
				id: 'u1',
				name: 'Ana',
			})
		})

		it('should throw when updateById matches no rows', async () => {
			const mock = createDb({
				returningRows: [],
			})
			const repository = createRepository(mock)

			await expect(
				repository.updateById('missing', {
					name: 'Bia',
				}),
			).rejects.toThrow(RecordNotFoundError)
		})

		it('should refetch with relations when updateById has the with option', async () => {
			const mock = createDb({
				firstRow: {
					id: 'u1',
					posts: [],
				},
			})
			const repository = createRepository(mock)

			const result = await repository.updateById(
				'u1',
				{
					name: 'Bia',
				},
				{
					with: {
						posts: true,
					},
				},
			)

			expect(result).toEqual({
				id: 'u1',
				posts: [],
			})
		})

		it('should throw when the refetch after updateById finds nothing', async () => {
			const mock = createDb({
				firstRow: null,
			})
			const repository = createRepository(mock)

			await expect(
				repository.updateById(
					'u1',
					{
						name: 'Bia',
					},
					{
						with: {
							posts: true,
						},
					},
				),
			).rejects.toThrow(RecordNotFoundError)
		})
	})

	describe('delete', () => {
		it('should delete rows matching the condition', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			const result = await repository.delete({
				where: (fields: Row, { eq }: WhereOperators) =>
					eq(fields.id as never, 'u1'),
			})

			expect(mock.deleteFn).toHaveBeenCalledTimes(1)
			expect(result).toHaveLength(1)
		})

		it('should throw when delete has no resolvable condition', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			await expect(
				repository.delete({
					where: () => undefined,
				}),
			).rejects.toThrow('where condition is required for delete')
		})

		it('should map returning columns for delete', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			await repository.delete({
				returning: {
					name: true,
				},
				where: sql`1 = 1`,
			})

			const returningArg = mock.mutationReturning.mock.calls[0][0] as Row
			expect(Object.keys(returningArg)).toEqual([
				'name',
			])
		})

		it('should delete by id and return the first row', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			const result = await repository.deleteById('u1')

			expect(result).toEqual({
				id: 'u1',
				name: 'Ana',
			})
		})

		it('should throw when deleteById matches no rows', async () => {
			const mock = createDb({
				returningRows: [],
			})
			const repository = createRepository(mock)

			await expect(repository.deleteById('missing')).rejects.toThrow(
				RecordNotFoundError,
			)
		})
	})

	describe('upsert', () => {
		it('should insert with conflict handling on the target columns', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			const result = await repository.upsert({
				create: {
					name: 'Ana',
				},
				target: [
					'id',
				],
				update: {
					name: 'Bia',
				},
			})

			expect(result).toEqual({
				id: 'u1',
				name: 'Ana',
			})
			const conflictArg = mock.onConflictDoUpdate.mock.calls[0][0] as Row
			expect(conflictArg.set).toEqual({
				name: 'Bia',
			})
			expect(conflictArg.target).toHaveLength(1)
			expect(conflictArg.where).toBeUndefined()
		})

		it('should pass a resolved where condition to the conflict clause', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			await repository.upsert({
				create: {
					name: 'Ana',
				},
				target: [
					'id',
				],
				update: {
					name: 'Bia',
				},
				where: (fields: Row, { eq }: WhereOperators) =>
					eq(fields.name as never, 'Ana'),
			})

			const conflictArg = mock.onConflictDoUpdate.mock.calls[0][0] as Row
			expect(conflictArg.where).toBeDefined()
		})

		it('should map returning columns for upsert', async () => {
			const mock = createDb()
			const repository = createRepository(mock)

			await repository.upsert({
				create: {
					name: 'Ana',
				},
				returning: {
					id: true,
				},
				target: [
					'id',
				],
				update: {
					name: 'Bia',
				},
			})

			const returningArg = mock.insertReturning.mock.calls[0][0] as Row
			expect(Object.keys(returningArg)).toEqual([
				'id',
			])
		})

		it('should throw when the upsert returns no rows', async () => {
			const mock = createDb({
				returningRows: [],
			})
			const repository = createRepository(mock)

			await expect(
				repository.upsert({
					create: {
						name: 'Ana',
					},
					target: [
						'id',
					],
					update: {
						name: 'Bia',
					},
				}),
			).rejects.toThrow(RecordNotCreatedError)
		})

		it('should refetch with relations when the with option is set', async () => {
			const mock = createDb({
				firstRow: {
					id: 'u1',
					posts: [],
				},
			})
			const repository = createRepository(mock)

			const result = await repository.upsert({
				create: {
					name: 'Ana',
				},
				target: [
					'id',
				],
				update: {
					name: 'Bia',
				},
				with: {
					posts: true,
				},
			})

			expect(result).toEqual({
				id: 'u1',
				posts: [],
			})
		})

		it('should throw when the refetch after upsert finds nothing', async () => {
			const mock = createDb({
				firstRow: null,
			})
			const repository = createRepository(mock)

			await expect(
				repository.upsert({
					create: {
						name: 'Ana',
					},
					target: [
						'id',
					],
					update: {
						name: 'Bia',
					},
					with: {
						posts: true,
					},
				}),
			).rejects.toThrow(RecordNotCreatedError)
		})
	})
})
