import { ConcurrentUpdateError } from '@turystack/exceptions'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { DynamoConnection } from '@/dynamodb/client.dynamodb.js'
import { createDynamoConnection } from '@/dynamodb/client.dynamodb.js'
import { DynamoRepository } from '@/dynamodb/dynamodb.repository.js'
import type { DynamoHandle } from '@/dynamodb/dynamodb.transaction.js'
import { dynamoTransaction } from '@/dynamodb/dynamodb.transaction.js'
import {
	createDynamoSchemaBuilder,
	materializeDynamoSchema,
} from '@/dynamodb/schema-builder.dynamodb.js'
import type { DynamoTable } from '@/dynamodb/schema-builder.types.dynamodb.js'

const ENDPOINT = process.env.TEST_DYNAMODB_ENDPOINT ?? 'http://localhost:8100'
const PREFIX = 'e2e-'
const ORGANIZATION = 'org-1'

const schema = createDynamoSchemaBuilder()

const auditEvents = schema.table({
	attributes: {
		actorId: schema.string(),
		auditEventId: schema.string(),
		occurredAt: schema.string(),
		organizationId: schema.string(),
		version: schema.number().optional(),
	},
	indexes: {
		byActor: {
			partition: 'organizationId',
			sort: 'actorId',
		},
	},
	key: {
		partition: 'organizationId',
		sort: 'occurredAt',
	},
})

const tables = materializeDynamoSchema({
	auditEvents,
})

let connection: DynamoConnection
let repository: DynamoRepository

/**
 * Creating the table is infrastructure, not the adapter's job — in a real app
 * it is CDK or Terraform. Here the test plays that part so the adapter is
 * exercised against a table it did not make.
 */
async function createTable(): Promise<void> {
	const core = await import('@aws-sdk/client-dynamodb')
	const client = new core.DynamoDBClient({
		credentials: {
			accessKeyId: 'local',
			secretAccessKey: 'local',
		},
		endpoint: ENDPOINT,
		region: 'us-east-1',
	})

	const definition = {
		AttributeDefinitions: [
			{
				AttributeName: 'organizationId',
				AttributeType: 'S' as const,
			},
			{
				AttributeName: 'occurredAt',
				AttributeType: 'S' as const,
			},
			{
				AttributeName: 'actorId',
				AttributeType: 'S' as const,
			},
		],
		BillingMode: 'PAY_PER_REQUEST' as const,
		GlobalSecondaryIndexes: [
			{
				IndexName: 'byActor',
				KeySchema: [
					{
						AttributeName: 'organizationId',
						KeyType: 'HASH' as const,
					},
					{
						AttributeName: 'actorId',
						KeyType: 'RANGE' as const,
					},
				],
				Projection: {
					ProjectionType: 'ALL' as const,
				},
			},
		],
		KeySchema: [
			{
				AttributeName: 'organizationId',
				KeyType: 'HASH' as const,
			},
			{
				AttributeName: 'occurredAt',
				KeyType: 'RANGE' as const,
			},
		],
		TableName: `${PREFIX}auditEvents`,
	}

	try {
		await client.send(new core.CreateTableCommand(definition))
	} catch (error) {
		if (
			(
				error as {
					name?: string
				}
			).name !== 'ResourceInUseException'
		) {
			throw error
		}
	}
}

/** The container is up before the server inside it answers. */
async function waitForDynamo(): Promise<void> {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		try {
			await fetch(ENDPOINT)
			return
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 500))
		}
	}

	throw new Error(
		`[e2e] nothing answering at ${ENDPOINT} — run \`pnpm services:up\` first`,
	)
}

function event(occurredAt: string, actorId = 'actor-1') {
	return {
		actorId,
		auditEventId: `event-${occurredAt}`,
		occurredAt,
		organizationId: ORGANIZATION,
	}
}

beforeAll(async () => {
	await waitForDynamo()
	await createTable()

	connection = await createDynamoConnection({
		credentials: {
			accessKeyId: 'local',
			secretAccessKey: 'local',
		},
		endpoint: ENDPOINT,
		region: 'us-east-1',
		tablePrefix: PREFIX,
	})

	repository = new DynamoRepository(
		() => connection as DynamoHandle,
		tables.auditEvents as DynamoTable,
	)
})

afterAll(async () => {
	const page = await repository.query({
		limit: 1000,
		partition: ORGANIZATION,
	})

	for (const item of page.items) {
		await repository.deleteById({
			occurredAt: item.occurredAt as string,
			organizationId: ORGANIZATION,
		})
	}
})

describe('dynamodb adapter against a real DynamoDB', () => {
	it('writes an item and reads it back by its key', async () => {
		await repository.create(event('2026-01-01T00:00:00Z'))

		const found = await repository.findById({
			occurredAt: '2026-01-01T00:00:00Z',
			organizationId: ORGANIZATION,
		})

		expect(found).toMatchObject({
			auditEventId: 'event-2026-01-01T00:00:00Z',
		})
	})

	it('pages through the sort key with a cursor, newest first', async () => {
		await repository.createMany([
			event('2026-02-01T00:00:00Z'),
			event('2026-02-02T00:00:00Z'),
			event('2026-02-03T00:00:00Z'),
		])

		const first = await repository.query({
			direction: 'desc',
			limit: 2,
			partition: ORGANIZATION,
		})

		expect(first.items).toHaveLength(2)
		expect(first.hasMore).toBe(true)
		expect(first.items[0].occurredAt).toBe('2026-02-03T00:00:00Z')

		const second = await repository.query({
			cursor: first.nextCursor,
			direction: 'desc',
			limit: 2,
			partition: ORGANIZATION,
		})

		const seen = [
			...first.items,
			...second.items,
		].map((item) => item.occurredAt)

		expect(new Set(seen).size).toBe(seen.length)
	})

	it('reads a declared index by its own sort key', async () => {
		await repository.create(event('2026-03-01T00:00:00Z', 'actor-9'))

		const page = await repository.query({
			index: 'byActor',
			partition: ORGANIZATION,
			sort: {
				eq: 'actor-9',
			},
		})

		expect(page.items).toHaveLength(1)
		expect(page.items[0].actorId).toBe('actor-9')
	})

	it('counts inside one partition without returning the items', async () => {
		const counted = await repository.count({
			partition: ORGANIZATION,
		})

		expect(counted).toBeGreaterThan(0)
	})

	it('settles a concurrent update in the engine, not in a read-then-write', async () => {
		const key = {
			occurredAt: '2026-04-01T00:00:00Z',
			organizationId: ORGANIZATION,
		}

		await repository.create({
			...event('2026-04-01T00:00:00Z'),
			version: 1,
		})

		const updated = await repository.updateById(
			key,
			{
				actorId: 'actor-2',
			},
			{
				expectedVersion: 1,
			},
		)

		expect(updated.version).toBe(2)

		// The second writer read version 1 too, and lost.
		await expect(
			repository.updateById(
				key,
				{
					actorId: 'actor-3',
				},
				{
					expectedVersion: 1,
				},
			),
		).rejects.toBeInstanceOf(ConcurrentUpdateError)

		const stored = await repository.findById(key)

		expect(stored).toMatchObject({
			actorId: 'actor-2',
			version: 2,
		})
	})

	it('lands a transaction as one atomic batch', async () => {
		await dynamoTransaction.run(connection, async (handle) => {
			const scoped = new DynamoRepository(
				() => handle as DynamoHandle,
				tables.auditEvents as DynamoTable,
			)

			await scoped.create(event('2026-05-01T00:00:00Z'))
			await scoped.create(event('2026-05-02T00:00:00Z'))
		})

		const page = await repository.query({
			partition: ORGANIZATION,
			sort: {
				beginsWith: '2026-05',
			},
		})

		expect(page.items).toHaveLength(2)
	})

	it('leaves nothing behind when the transaction throws before the flush', async () => {
		await expect(
			dynamoTransaction.run(connection, async (handle) => {
				const scoped = new DynamoRepository(
					() => handle as DynamoHandle,
					tables.auditEvents as DynamoTable,
				)

				await scoped.create(event('2026-06-01T00:00:00Z'))

				throw new Error('the operation changed its mind')
			}),
		).rejects.toThrow('changed its mind')

		const page = await repository.query({
			partition: ORGANIZATION,
			sort: {
				beginsWith: '2026-06',
			},
		})

		expect(page.items).toHaveLength(0)
	})

	it('does not let a read inside a transaction see the buffered write', async () => {
		await dynamoTransaction.run(connection, async (handle) => {
			const scoped = new DynamoRepository(
				() => handle as DynamoHandle,
				tables.auditEvents as DynamoTable,
			)

			await scoped.create(event('2026-07-01T00:00:00Z'))

			// Documented divergence from PostgreSQL: the write is still in the
			// buffer, so the store has nothing to return yet.
			const duringTransaction = await scoped.findById({
				occurredAt: '2026-07-01T00:00:00Z',
				organizationId: ORGANIZATION,
			})

			expect(duringTransaction).toBeUndefined()
		})

		const afterCommit = await repository.findById({
			occurredAt: '2026-07-01T00:00:00Z',
			organizationId: ORGANIZATION,
		})

		expect(afterCommit).toBeDefined()
	})

	it('removes an item and hands back what it removed', async () => {
		await repository.create(event('2026-08-01T00:00:00Z'))

		const removed = await repository.deleteById({
			occurredAt: '2026-08-01T00:00:00Z',
			organizationId: ORGANIZATION,
		})

		expect(removed).toMatchObject({
			auditEventId: 'event-2026-08-01T00:00:00Z',
		})
		expect(
			await repository.findById({
				occurredAt: '2026-08-01T00:00:00Z',
				organizationId: ORGANIZATION,
			}),
		).toBeUndefined()
	})
})
