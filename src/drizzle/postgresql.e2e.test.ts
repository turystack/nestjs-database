import { Test } from '@nestjs/testing'
import { ConcurrentUpdateError } from '@turystack/exceptions'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { registerAuditActor } from '@/audit.context.js'
import { defineDatabaseSchema } from '@/database.helpers.js'
import { DatabaseModule } from '@/database.module.js'
import { DatabaseService } from '@/database.service.js'
import { onAfterCommit, onBeforeCommit } from '@/transaction.context.js'
import { Transactional } from '@/transactional.js'

const URL =
	process.env.TEST_DATABASE_URL ??
	'postgres://turystack:turystack@localhost:5442/turystack_test'

const databaseSchema = defineDatabaseSchema((schema) => ({
	orders: schema.table({
		createdBy: schema.text('created_by'),
		orderId: schema.uuid('order_id').primaryKey().defaultRandom(),
		status: schema.text('status').notNull(),
		total: schema.integer('total').notNull(),
		updatedBy: schema.text('updated_by'),
		version: schema.integer('version').notNull().default(1),
	}),
}))

type OrderRepository = {
	count(options?: unknown): Promise<number>
	create(data: unknown, options?: unknown): Promise<Record<string, unknown>>
	createMany(data: unknown[]): Promise<Record<string, unknown>[]>
	delete(options: unknown): Promise<Record<string, unknown>[]>
	deleteById(id: string): Promise<Record<string, unknown>>
	exists(options: unknown): Promise<boolean>
	findById(id: string): Promise<Record<string, unknown> | undefined>
	findMany(config?: unknown): Promise<Record<string, unknown>[]>
	update(options: unknown): Promise<Record<string, unknown>[]>
	updateById(
		id: string,
		data: unknown,
		options?: unknown,
	): Promise<Record<string, unknown>>
	upsert(options: unknown): Promise<Record<string, unknown>>
}

let db: DatabaseService
let orders: OrderRepository

/** Creating the table is infrastructure; the adapter only reads and writes it. */
async function migrate(): Promise<void> {
	const { Client } = await import('pg')
	const client = new Client({
		connectionString: URL,
	})

	await client.connect()
	await client.query(`
		CREATE TABLE IF NOT EXISTS orders (
			order_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			created_by text,
			status text NOT NULL,
			total integer NOT NULL,
			updated_by text,
			version integer NOT NULL DEFAULT 1
		)
	`)
	await client.end()
}

async function waitForPostgres(): Promise<void> {
	const { Client } = await import('pg')

	for (let attempt = 0; attempt < 40; attempt += 1) {
		const client = new Client({
			connectionString: URL,
		})

		try {
			await client.connect()
			await client.end()
			return
		} catch {
			await client.end().catch(() => undefined)
			await new Promise((resolve) => setTimeout(resolve, 500))
		}
	}

	throw new Error(
		`[e2e] nothing answering at ${URL} — run \`pnpm services:up\` first`,
	)
}

/** Exercises the decorator the way an application does: on a real class. */
class OrderService {
	constructor(private readonly _db: DatabaseService) {}

	@Transactional()
	async placeTwo(): Promise<void> {
		const repository = (
			this._db as unknown as {
				orders: OrderRepository
			}
		).orders

		await repository.create({
			status: 'NEW',
			total: 1,
		})
		await repository.create({
			status: 'NEW',
			total: 2,
		})
	}

	@Transactional()
	async placeThenFail(): Promise<void> {
		const repository = (
			this._db as unknown as {
				orders: OrderRepository
			}
		).orders

		await repository.create({
			status: 'DOOMED',
			total: 3,
		})

		throw new Error('the operation changed its mind')
	}

	@Transactional()
	async placeWithHooks(seen: string[]): Promise<void> {
		const repository = (
			this._db as unknown as {
				orders: OrderRepository
			}
		).orders

		onBeforeCommit(async () => {
			seen.push('before')
			await repository.create({
				status: 'HOOKED',
				total: 4,
			})
		})
		onAfterCommit(() => {
			seen.push('after')
		})

		await repository.create({
			status: 'NEW',
			total: 5,
		})
	}
}

beforeAll(async () => {
	await waitForPostgres()
	await migrate()

	const moduleRef = await Test.createTestingModule({
		imports: [
			DatabaseModule.register({
				adapter: 'postgresql',
				postgresql: {
					url: URL,
				},
				schemaResolver: databaseSchema,
			}),
		],
	}).compile()

	db = moduleRef.get(DatabaseService)
	orders = (
		db as unknown as {
			orders: OrderRepository
		}
	).orders
})

beforeEach(async () => {
	const { Client } = await import('pg')
	const client = new Client({
		connectionString: URL,
	})
	await client.connect()
	await client.query('TRUNCATE orders')
	await client.end()
})

afterAll(() => {
	registerAuditActor(undefined)
})

describe('postgresql adapter against a real Postgres', () => {
	it('builds one repository per declared table and round-trips a row', async () => {
		const created = await orders.create({
			status: 'NEW',
			total: 10,
		})

		expect(created.orderId).toBeTypeOf('string')

		const found = await orders.findById(created.orderId as string)

		expect(found).toMatchObject({
			status: 'NEW',
			total: 10,
		})
	})

	it('reads through the Drizzle query API the adapter passes down', async () => {
		await orders.createMany([
			{
				status: 'NEW',
				total: 1,
			},
			{
				status: 'PAID',
				total: 2,
			},
		])

		const paid = await orders.findMany({
			where: (
				fields: Record<string, unknown>,
				operators: Record<string, never>,
			) =>
				(
					operators as unknown as {
						eq: (a: unknown, b: unknown) => unknown
					}
				).eq(fields.status, 'PAID'),
		})

		expect(paid).toHaveLength(1)
		expect(await orders.count()).toBe(2)
		expect(
			await orders.exists({
				where: (
					fields: Record<string, unknown>,
					operators: Record<string, never>,
				) =>
					(
						operators as unknown as {
							eq: (a: unknown, b: unknown) => unknown
						}
					).eq(fields.status, 'PAID'),
			}),
		).toBe(true)
	})

	it('writes by predicate, which is the half DynamoDB does not have', async () => {
		await orders.createMany([
			{
				status: 'NEW',
				total: 1,
			},
			{
				status: 'NEW',
				total: 2,
			},
		])

		const updated = await orders.update({
			data: {
				status: 'PAID',
			},
			where: (
				fields: Record<string, unknown>,
				operators: Record<string, never>,
			) =>
				(
					operators as unknown as {
						eq: (a: unknown, b: unknown) => unknown
					}
				).eq(fields.status, 'NEW'),
		})

		expect(updated).toHaveLength(2)

		const removed = await orders.delete({
			where: (
				fields: Record<string, unknown>,
				operators: Record<string, never>,
			) =>
				(
					operators as unknown as {
						eq: (a: unknown, b: unknown) => unknown
					}
				).eq(fields.status, 'PAID'),
		})

		expect(removed).toHaveLength(2)
		expect(await orders.count()).toBe(0)
	})

	it('settles a concurrent update and names the version that won', async () => {
		const created = await orders.create({
			status: 'NEW',
			total: 1,
		})
		const id = created.orderId as string

		const updated = await orders.updateById(
			id,
			{
				status: 'PAID',
			},
			{
				expectedVersion: 1,
			},
		)

		expect(updated.version).toBe(2)

		await expect(
			orders.updateById(
				id,
				{
					status: 'CANCELLED',
				},
				{
					expectedVersion: 1,
				},
			),
		).rejects.toBeInstanceOf(ConcurrentUpdateError)

		expect(await orders.findById(id)).toMatchObject({
			status: 'PAID',
			version: 2,
		})
	})

	it('stamps the acting principal on a create', async () => {
		registerAuditActor(() => 'user-7')

		const created = await orders.create({
			status: 'NEW',
			total: 1,
		})

		expect(created.createdBy).toBe('user-7')

		registerAuditActor(undefined)
	})

	it('commits everything the decorated method wrote', async () => {
		await new OrderService(db).placeTwo()

		expect(await orders.count()).toBe(2)
	})

	it('rolls back everything when the method throws', async () => {
		await expect(new OrderService(db).placeThenFail()).rejects.toThrow(
			'changed its mind',
		)

		expect(await orders.count()).toBe(0)
	})

	it('runs the before hook inside the transaction and the after hook once it landed', async () => {
		const seen: string[] = []

		await new OrderService(db).placeWithHooks(seen)

		expect(seen).toEqual([
			'before',
			'after',
		])
		// The hook's own write shares the fate of the write that queued it.
		expect(await orders.count()).toBe(2)
	})
})
