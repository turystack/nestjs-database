import { ConcurrentUpdateError } from '@turystack/exceptions'
import { describe, expect, it, vi } from 'vitest'

import { registerAuditActor } from '@/audit.context.js'

import { DynamoRepository } from '@/dynamodb/dynamodb.repository.js'
import type { DynamoHandle } from '@/dynamodb/dynamodb.transaction.js'
import { dynamoTransaction } from '@/dynamodb/dynamodb.transaction.js'
import {
	createDynamoSchemaBuilder,
	materializeDynamoSchema,
} from '@/dynamodb/schema-builder.dynamodb.js'
import type { DynamoTable } from '@/dynamodb/schema-builder.types.dynamodb.js'

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

/** Records what was sent instead of talking to AWS. */
function createFakeConnection(reply: Record<string, unknown> = {}) {
	const send = vi.fn(async (command: object) => ({
		...reply,
		...(
			command as {
				input?: Record<string, unknown>
			}
		).input,
	}))

	const command = (name: string) =>
		class {
			readonly name = name
			constructor(readonly input: Record<string, unknown>) {}
		}

	return {
		client: {
			send,
		},
		sdk: {
			BatchWriteCommand: command('BatchWrite'),
			DeleteCommand: command('Delete'),
			GetCommand: command('Get'),
			PutCommand: command('Put'),
			QueryCommand: command('Query'),
			TransactWriteCommand: command('TransactWrite'),
			UpdateCommand: command('Update'),
		},
		send,
		tablePrefix: 'test-',
	} as unknown as DynamoHandle & {
		send: ReturnType<typeof vi.fn>
	}
}

function createRepository(handle: DynamoHandle) {
	const tables = materializeDynamoSchema({
		auditEvents,
	})

	return new DynamoRepository(() => handle, tables.auditEvents as DynamoTable)
}

describe('dynamo schema builder', () => {
	it('names each table after the key it was declared under', () => {
		const tables = materializeDynamoSchema({
			auditEvents,
		})

		expect(tables.auditEvents.name).toBe('auditEvents')
		expect(tables.auditEvents.key).toEqual({
			partition: 'organizationId',
			sort: 'occurredAt',
		})
	})

	it('refuses a key naming an attribute that was never declared', () => {
		const broken = schema.table({
			attributes: {
				id: schema.string(),
			},
			key: {
				partition: 'organizationId' as 'id',
			},
		})

		expect(() =>
			materializeDynamoSchema({
				broken,
			}),
		).toThrow('no such attribute exists')
	})
})

describe('DynamoRepository reads', () => {
	it('prefixes the table name and addresses one item on findById', async () => {
		const handle = createFakeConnection({
			Item: {
				auditEventId: 'e1',
			},
		})
		const repository = createRepository(handle)

		const found = await repository.findById({
			occurredAt: '2026-01-01',
			organizationId: 'org-1',
		})

		expect(found).toMatchObject({
			auditEventId: 'e1',
		})
		expect(handle.send.mock.calls[0][0].input).toMatchObject({
			TableName: 'test-auditEvents',
		})
	})

	it('walks the sort key backwards and hands back a cursor', async () => {
		const handle = createFakeConnection({
			Items: [
				{
					auditEventId: 'e1',
				},
			],
			LastEvaluatedKey: {
				occurredAt: '2026-01-01',
				organizationId: 'org-1',
			},
		})
		const repository = createRepository(handle)

		const page = await repository.query({
			direction: 'desc',
			limit: 20,
			partition: 'org-1',
		})

		expect(page.hasMore).toBe(true)
		expect(page.nextCursor).toBeTypeOf('string')
		expect(handle.send.mock.calls[0][0].input).toMatchObject({
			KeyConditionExpression: '#partition = :partition',
			Limit: 20,
			ScanIndexForward: false,
		})
	})

	it('resumes from a cursor it issued', async () => {
		const handle = createFakeConnection({
			Items: [],
		})
		const repository = createRepository(handle)
		const cursor = Buffer.from(
			JSON.stringify({
				organizationId: 'org-1',
			}),
			'utf8',
		).toString('base64url')

		await repository.query({
			cursor,
			partition: 'org-1',
		})

		expect(handle.send.mock.calls[0][0].input.ExclusiveStartKey).toEqual({
			organizationId: 'org-1',
		})
	})

	it('reads a declared index by the index key, not the table key', async () => {
		const handle = createFakeConnection({
			Items: [],
		})
		const repository = createRepository(handle)

		await repository.query({
			index: 'byActor',
			partition: 'org-1',
			sort: {
				eq: 'actor-9',
			},
		})

		const input = handle.send.mock.calls[0][0].input

		expect(input.IndexName).toBe('byActor')
		expect(input.ExpressionAttributeNames['#sort']).toBe('actorId')
	})

	it('refuses an index the schema never declared', async () => {
		const repository = createRepository(createFakeConnection())

		await expect(
			repository.query({
				index: 'byResource' as 'byActor',
				partition: 'org-1',
			}),
		).rejects.toThrow('declares no index "byResource"')
	})

	it('refuses a cursor it did not issue', async () => {
		const repository = createRepository(createFakeConnection())

		await expect(
			repository.query({
				cursor: 'not-a-cursor',
				partition: 'org-1',
			}),
		).rejects.toThrow('not a cursor this table issued')
	})
})

describe('DynamoRepository writes', () => {
	it('settles optimistic locking with a condition on the write itself', async () => {
		const handle = createFakeConnection({
			Attributes: {
				version: 4,
			},
		})
		const repository = createRepository(handle)

		await repository.updateById(
			{
				occurredAt: '2026-01-01',
				organizationId: 'org-1',
			},
			{
				actorId: 'actor-2',
			},
			{
				expectedVersion: 3,
			},
		)

		const input = handle.send.mock.calls[0][0].input

		expect(input.ConditionExpression).toBe(
			'#expectedVersion = :expectedVersion',
		)
		expect(input.ExpressionAttributeValues[':expectedVersion']).toBe(3)
		expect(input.ExpressionAttributeValues[':version']).toBe(4)
	})

	it('reads the loser from the refused write, with no second round trip', async () => {
		const handle = createFakeConnection()
		handle.send.mockRejectedValueOnce(
			Object.assign(new Error('refused'), {
				Item: {
					version: 7,
				},
				name: 'ConditionalCheckFailedException',
			}),
		)
		const repository = createRepository(handle)

		await expect(
			repository.updateById(
				{
					occurredAt: '2026-01-01',
					organizationId: 'org-1',
				},
				{
					actorId: 'actor-2',
				},
				{
					expectedVersion: 3,
				},
			),
		).rejects.toBeInstanceOf(ConcurrentUpdateError)

		expect(handle.send).toHaveBeenCalledTimes(1)
	})

	it('chunks a batch write at the engine limit', async () => {
		const handle = createFakeConnection()
		const repository = createRepository(handle)

		await repository.createMany(
			Array.from(
				{
					length: 26,
				},
				(_, index) => ({
					actorId: 'actor-1',
					auditEventId: `e${index}`,
					occurredAt: '2026-01-01',
					organizationId: 'org-1',
				}),
			),
		)

		expect(handle.send).toHaveBeenCalledTimes(2)
	})
})

describe('DynamoRepository audit stamping', () => {
	it('stamps the acting principal on a create when the table declared it', async () => {
		registerAuditActor(() => 'user-7')

		const stamped = createDynamoSchemaBuilder()
		const withAudit = stamped.table({
			attributes: {
				createdBy: stamped.string().optional(),
				id: stamped.string(),
				updatedBy: stamped.string().optional(),
			},
			key: {
				partition: 'id',
			},
		})
		const tables = materializeDynamoSchema({
			withAudit,
		})
		const handle = createFakeConnection()
		const repository = new DynamoRepository(
			() => handle,
			tables.withAudit as DynamoTable,
		)

		await repository.create({
			id: 'a',
		})

		expect(handle.send.mock.calls[0][0].input.Item).toMatchObject({
			createdBy: 'user-7',
		})

		registerAuditActor(undefined)
	})

	it('leaves a table that declared no audit attribute untouched', async () => {
		registerAuditActor(() => 'user-7')

		const handle = createFakeConnection()
		const repository = createRepository(handle)

		await repository.create({
			actorId: 'actor-1',
			auditEventId: 'e1',
			occurredAt: '2026-01-01',
			organizationId: 'org-1',
		})

		expect(handle.send.mock.calls[0][0].input.Item.createdBy).toBeUndefined()

		registerAuditActor(undefined)
	})
})

describe('dynamo transactions', () => {
	it('refuses an isolation level instead of ignoring it', async () => {
		await expect(
			dynamoTransaction.run(createFakeConnection(), async () => undefined, {
				isolationLevel: 'serializable',
			}),
		).rejects.toThrow('has no isolation levels')
	})

	it('buffers the writes and sends them as one atomic batch', async () => {
		const connection = createFakeConnection()

		await dynamoTransaction.run(connection, async (handle) => {
			const repository = createRepository(handle as DynamoHandle)

			await repository.create({
				actorId: 'actor-1',
				auditEventId: 'e1',
				occurredAt: '2026-01-01',
				organizationId: 'org-1',
			})
			await repository.create({
				actorId: 'actor-1',
				auditEventId: 'e2',
				occurredAt: '2026-01-02',
				organizationId: 'org-1',
			})
		})

		expect(connection.send).toHaveBeenCalledTimes(1)
		expect(connection.send.mock.calls[0][0].input.TransactItems).toHaveLength(2)
	})

	it('sends nothing when the operation wrote nothing', async () => {
		const connection = createFakeConnection()

		await dynamoTransaction.run(connection, async () => 'done')

		expect(connection.send).not.toHaveBeenCalled()
	})

	it('refuses a batch over the engine ceiling rather than splitting it', async () => {
		const connection = createFakeConnection()

		await expect(
			dynamoTransaction.run(connection, async (handle) => {
				const repository = createRepository(handle as DynamoHandle)

				await repository.createMany(
					Array.from(
						{
							length: 101,
						},
						(_, index) => ({
							actorId: 'actor-1',
							auditEventId: `e${index}`,
							occurredAt: '2026-01-01',
							organizationId: 'org-1',
						}),
					),
				)
			}),
		).rejects.toThrow("over DynamoDB's limit of 100")
	})

	it('refuses updateById inside a transaction, and says why', async () => {
		const connection = createFakeConnection()

		await expect(
			dynamoTransaction.run(connection, async (handle) => {
				const repository = createRepository(handle as DynamoHandle)

				await repository.updateById(
					{
						occurredAt: '2026-01-01',
						organizationId: 'org-1',
					},
					{
						actorId: 'actor-2',
					},
				)
			}),
		).rejects.toThrow('cannot run inside @Transactional')
	})
})
