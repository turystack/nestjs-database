import { ConcurrentUpdateError } from '@turystack/exceptions'

import {
	CREATED_BY_COLUMN,
	UPDATED_BY_COLUMN,
	withAuditActor,
} from '@/audit.context.js'

import type {
	DynamoPage,
	DynamoUpdateOptions,
	SortCondition,
} from '@/dynamodb/dynamodb.repository.types.js'
import type { DynamoHandle } from '@/dynamodb/dynamodb.transaction.js'
import type { DynamoTable } from '@/dynamodb/schema-builder.types.dynamodb.js'
import { RecordNotFoundError } from '@/repository/table-repository.errors.js'

const DEFAULT_VERSION_ATTRIBUTE = 'version'
const DEFAULT_LIMIT = 25
const BATCH_WRITE_MAX = 25

type Row = Record<string, unknown>

/** A cursor is the engine's own resume token, made safe to put in a URL. */
function encodeCursor(key: Row): string {
	return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): Row {
	try {
		return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Row
	} catch {
		throw new Error(
			'[DynamoRepository] cursor is not a cursor this table issued',
		)
	}
}

function sortExpression(condition: SortCondition, values: Row): string {
	if ('beginsWith' in condition) {
		values[':sort'] = condition.beginsWith
		return `begins_with(#sort, :sort)`
	}

	if ('between' in condition) {
		values[':sortFrom'] = condition.between[0]
		values[':sortTo'] = condition.between[1]
		return `#sort BETWEEN :sortFrom AND :sortTo`
	}

	const [operator, value] = Object.entries(condition)[0] as [
		string,
		number | string,
	]
	const symbols: Record<string, string> = {
		eq: '=',
		gt: '>',
		gte: '>=',
		lt: '<',
		lte: '<=',
	}

	values[':sort'] = value

	return `#sort ${symbols[operator] ?? '='} :sort`
}

/**
 * A table on DynamoDB.
 *
 * Every read goes through a declared key path and every write addresses one
 * item, because those are the two things the engine does well. What it would
 * only fake — a relational read, a write by predicate, a table-wide count — is
 * absent from the type rather than present and expensive.
 */
export class DynamoRepository {
	constructor(
		private readonly _getHandle: () => DynamoHandle,
		private readonly _table: DynamoTable,
	) {}

	async findById(key: Row): Promise<Row | undefined> {
		const handle = this._getHandle()
		const result = await handle.client.send(
			new handle.sdk.GetCommand({
				Key: key,
				TableName: this._tableName(handle),
			}),
		)

		return result.Item as Row | undefined
	}

	async exists(key: Row): Promise<boolean> {
		return (await this.findById(key)) !== undefined
	}

	async query(input: {
		cursor?: string
		direction?: 'asc' | 'desc'
		index?: string
		limit?: number
		partition: number | string
		sort?: SortCondition
	}): Promise<DynamoPage<Row>> {
		const handle = this._getHandle()
		const limit = input.limit ?? DEFAULT_LIMIT
		const result = await handle.client.send(
			new handle.sdk.QueryCommand({
				...this._keyCondition(input),
				...(input.cursor
					? {
							ExclusiveStartKey: decodeCursor(input.cursor),
						}
					: {}),
				...(input.index
					? {
							IndexName: input.index,
						}
					: {}),
				Limit: limit,
				ScanIndexForward: input.direction !== 'desc',
				TableName: this._tableName(handle),
			}),
		)

		const last = result.LastEvaluatedKey as Row | undefined

		return {
			hasMore: last !== undefined,
			items: (result.Items ?? []) as Row[],
			...(last
				? {
						nextCursor: encodeCursor(last),
					}
				: {}),
		}
	}

	async count(input: {
		index?: string
		partition: number | string
		sort?: SortCondition
	}): Promise<number> {
		const handle = this._getHandle()
		const result = await handle.client.send(
			new handle.sdk.QueryCommand({
				...this._keyCondition(input),
				...(input.index
					? {
							IndexName: input.index,
						}
					: {}),
				Select: 'COUNT',
				TableName: this._tableName(handle),
			}),
		)

		return (result.Count as number | undefined) ?? 0
	}

	async create(data: Row): Promise<Row> {
		return this._put(this._stamp(data, CREATED_BY_COLUMN))
	}

	async upsert(data: Row): Promise<Row> {
		return this._put(this._stamp(data, CREATED_BY_COLUMN))
	}

	async createMany(rows: Row[]): Promise<Row[]> {
		const handle = this._getHandle()
		const data = rows.map((row) => this._stamp(row, CREATED_BY_COLUMN))

		if (handle.enqueue) {
			for (const item of data) {
				handle.enqueue({
					Put: {
						Item: item,
						TableName: this._tableName(handle),
					},
				})
			}

			return data
		}

		for (let index = 0; index < data.length; index += BATCH_WRITE_MAX) {
			const chunk = data.slice(index, index + BATCH_WRITE_MAX)

			await handle.client.send(
				new handle.sdk.BatchWriteCommand({
					RequestItems: {
						[this._tableName(handle)]: chunk.map((item) => ({
							PutRequest: {
								Item: item,
							},
						})),
					},
				}),
			)
		}

		return data
	}

	async updateById(
		key: Row,
		data: Row,
		options?: DynamoUpdateOptions,
	): Promise<Row> {
		const handle = this._getHandle()

		if (handle.enqueue) {
			throw new Error(
				'[DynamoRepository] updateById cannot run inside @Transactional: the write is only sent at commit, so there is no resulting item to return. Use create/upsert, or move the update outside the transaction.',
			)
		}

		const versionAttribute =
			options?.versionAttribute ?? DEFAULT_VERSION_ATTRIBUTE
		const patch: Row = this._stamp(data, UPDATED_BY_COLUMN)

		if (options?.expectedVersion !== undefined) {
			patch[versionAttribute] = options.expectedVersion + 1
		}

		const names: Record<string, string> = {}
		const values: Row = {}
		const sets: string[] = []

		for (const [attribute, value] of Object.entries(patch)) {
			names[`#${attribute}`] = attribute
			values[`:${attribute}`] = value
			sets.push(`#${attribute} = :${attribute}`)
		}

		if (sets.length === 0) {
			throw new Error(
				'[DynamoRepository] updateById needs at least one attribute',
			)
		}

		if (options?.expectedVersion !== undefined) {
			names['#expectedVersion'] = versionAttribute
			values[':expectedVersion'] = options.expectedVersion
		}

		try {
			const result = await handle.client.send(
				new handle.sdk.UpdateCommand({
					...(options?.expectedVersion !== undefined
						? {
								ConditionExpression: '#expectedVersion = :expectedVersion',
							}
						: {}),
					ExpressionAttributeNames: names,
					ExpressionAttributeValues: values,
					Key: key,
					ReturnValues: 'ALL_NEW',
					ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
					TableName: this._tableName(handle),
					UpdateExpression: `SET ${sets.join(', ')}`,
				}),
			)

			return result.Attributes as Row
		} catch (error) {
			throw this._explainConditionFailure(error, key, options, versionAttribute)
		}
	}

	async deleteById(key: Row): Promise<Row> {
		const handle = this._getHandle()

		if (handle.enqueue) {
			throw new Error(
				'[DynamoRepository] deleteById cannot run inside @Transactional: the write is only sent at commit, so the deleted item cannot be returned. Move the delete outside the transaction.',
			)
		}

		const result = await handle.client.send(
			new handle.sdk.DeleteCommand({
				Key: key,
				ReturnValues: 'ALL_OLD',
				TableName: this._tableName(handle),
			}),
		)

		if (!result.Attributes) {
			throw new RecordNotFoundError(this._table.name)
		}

		return result.Attributes as Row
	}

	/**
	 * Stamps the acting principal, when the table declared the attribute.
	 *
	 * The same helper the SQL repository uses: it is pure record work, so the
	 * only engine-specific part is what counts as a declared column — here, the
	 * declared attributes.
	 */
	private _stamp(data: Row, attribute: string): Row {
		return withAuditActor(data, this._table.attributes, attribute)
	}

	private async _put(data: Row): Promise<Row> {
		const handle = this._getHandle()

		if (handle.enqueue) {
			handle.enqueue({
				Put: {
					Item: data,
					TableName: this._tableName(handle),
				},
			})

			return data
		}

		await handle.client.send(
			new handle.sdk.PutCommand({
				Item: data,
				TableName: this._tableName(handle),
			}),
		)

		return data
	}

	/**
	 * Turns a refused condition into the same error the SQL repository raises.
	 *
	 * The engine hands back the item it refused to overwrite, so the actual
	 * version comes for free — no second read to find out who won.
	 */
	private _explainConditionFailure(
		error: unknown,
		_key: Row,
		options: DynamoUpdateOptions | undefined,
		versionAttribute: string,
	): unknown {
		const failure = error as {
			Item?: Row
			name?: string
		}

		if (failure.name !== 'ConditionalCheckFailedException') {
			return error
		}

		if (!failure.Item) {
			return new RecordNotFoundError(this._table.name)
		}

		return new ConcurrentUpdateError(
			`[DynamoRepository] "${this._table.name}" was updated by another writer`,
			{
				actualVersion: failure.Item[versionAttribute],
				expectedVersion: options?.expectedVersion,
				table: this._table.name,
			},
		)
	}

	private _keyCondition(input: {
		index?: string
		partition: number | string
		sort?: SortCondition
	}): Row {
		const key = this._keyFor(input.index)
		const names: Record<string, string> = {
			'#partition': key.partition,
		}
		const values: Row = {
			':partition': input.partition,
		}
		let expression = '#partition = :partition'

		if (input.sort) {
			if (!key.sort) {
				throw new Error(
					`[DynamoRepository] "${input.index ?? this._table.name}" has no sort key, so a sort condition cannot be applied`,
				)
			}

			names['#sort'] = key.sort
			expression = `${expression} AND ${sortExpression(input.sort, values)}`
		}

		return {
			ExpressionAttributeNames: names,
			ExpressionAttributeValues: values,
			KeyConditionExpression: expression,
		}
	}

	/** The key path a read walks: the table's own, or a declared index's. */
	private _keyFor(index?: string) {
		if (!index) {
			return this._table.key
		}

		const declared = this._table.indexes?.[index]

		if (!declared) {
			throw new Error(
				`[DynamoRepository] table "${this._table.name}" declares no index "${index}"`,
			)
		}

		return declared
	}

	private _tableName(handle: DynamoHandle): string {
		return `${handle.tablePrefix}${this._table.name}`
	}
}
