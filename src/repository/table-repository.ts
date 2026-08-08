import { ConcurrentUpdateError } from '@turystack/exceptions'
import {
	and,
	between,
	count as countFn,
	eq,
	exists,
	getTableColumns,
	gt,
	gte,
	ilike,
	inArray,
	isNotNull,
	isNull,
	like,
	lt,
	lte,
	ne,
	not,
	notBetween,
	notExists,
	notIlike,
	notInArray,
	notLike,
	or,
	type SQL,
	sql,
	type Table,
} from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'

import {
	CREATED_BY_COLUMN,
	UPDATED_BY_COLUMN,
	withAuditActor,
} from '@/audit.context.js'

import {
	RecordNotCreatedError,
	RecordNotFoundError,
} from './table-repository.errors.js'
import type { WhereOperators } from './table-repository.types.js'

/** Column holding the row version when optimistic locking is used. */
const DEFAULT_VERSION_COLUMN = 'version'

// ---------------------------------------------------------------------------
// Operators singleton
// ---------------------------------------------------------------------------

const WHERE_OPERATORS: WhereOperators = {
	and,
	between,
	eq,
	exists,
	gt,
	gte,
	ilike,
	inArray,
	isNotNull,
	isNull,
	like,
	lt,
	lte,
	ne,
	not,
	notBetween,
	notExists,
	notIlike,
	notInArray,
	notLike,
	or,
	sql,
}

// ---------------------------------------------------------------------------
// Internal proxy types (Drizzle runtime shapes)
// ---------------------------------------------------------------------------

interface QueryProxy {
	findMany: (config?: unknown) => Promise<unknown[]>
	findFirst: (config?: unknown) => Promise<unknown>
}

interface InsertChain {
	returning: (fields?: Record<string, unknown>) => Promise<unknown[]>
	onConflictDoUpdate: (opts: {
		target: unknown | unknown[]
		set: Record<string, unknown>
		where?: SQL
	}) => InsertChain
}

interface MutationChain {
	where: (condition: SQL) => {
		returning: (fields?: Record<string, unknown>) => Promise<unknown[]>
	}
}

interface SelectChain extends Promise<Record<string, unknown>[]> {
	where: (condition: SQL) => SelectChain
	limit: (n: number) => SelectChain
}

interface DbProxy {
	query: Record<string, QueryProxy>
	insert: (table: Table) => {
		values: (data: unknown) => InsertChain
	}
	update: (table: Table) => {
		set: (data: unknown) => MutationChain
	}
	delete: (table: Table) => MutationChain
	select: (fields: Record<string, unknown>) => {
		from: (table: Table) => SelectChain
	}
}

// ---------------------------------------------------------------------------
// TableRepository
// ---------------------------------------------------------------------------

export class TableRepository {
	private readonly _pkColumn: string
	private readonly _pkHasDefault: boolean

	constructor(
		private readonly _getDb: () => unknown,
		private readonly _tableName: string,
		private readonly _table: Table,
	) {
		const columns = getTableColumns(this._table)
		const pk = Object.entries(columns).find(
			([_, col]) =>
				(
					col as unknown as {
						primary: boolean
					}
				).primary,
		)

		if (!pk) {
			throw new Error(
				`[TableRepository] table "${_tableName}" has no primary key`,
			)
		}

		this._pkColumn = pk[0]
		this._pkHasDefault = (
			pk[1] as unknown as {
				hasDefault: boolean
			}
		).hasDefault
	}

	// -----------------------------------------------------------------------
	// Queries
	// -----------------------------------------------------------------------

	async findMany(config?: unknown): Promise<unknown[]> {
		const db = this._db()
		return db.query[this._tableName].findMany(config)
	}

	async findFirst(config?: unknown): Promise<unknown> {
		const db = this._db()
		return db.query[this._tableName].findFirst(config)
	}

	async findById(
		id: unknown,
		options?: {
			columns?: Record<string, boolean>
			with?: Record<string, unknown>
		},
	): Promise<unknown> {
		return this.findFirst({
			where: this._pkEq(id),
			...options,
		})
	}

	async count(options?: { where?: unknown }): Promise<number> {
		const db = this._db()
		const query = db
			.select({
				count: countFn(),
			})
			.from(this._table)

		const result = options?.where
			? await this._applySelectWhere(query, options.where)
			: await query

		return Number(result[0].count)
	}

	async exists(options: { where: unknown }): Promise<boolean> {
		const db = this._db()
		const condition = this._evaluateWhere(options.where)

		if (!condition) {
			throw new Error(
				'[TableRepository] where condition is required for exists',
			)
		}

		const result = await db
			.select({
				_: sql`1`,
			})
			.from(this._table)
			.where(condition)
			.limit(1)

		return result.length > 0
	}

	// -----------------------------------------------------------------------
	// Mutations
	// -----------------------------------------------------------------------

	async create(
		data: Record<string, unknown>,
		options?: {
			returning?: Record<string, boolean>
			with?: Record<string, unknown>
		},
	): Promise<unknown> {
		const createData = this._withCreatedBy(this._autoGeneratePk(data))
		const db = this._db()
		const chain = db.insert(this._table).values(createData)

		if (options?.with) {
			await chain.returning()

			const result = await this._refetch(createData[this._pkColumn], {
				columns: options?.returning,
				with: options?.with,
			})

			if (!result) {
				throw new RecordNotCreatedError(this._tableName)
			}
			return result
		}

		const rows = options?.returning
			? await chain.returning(this._mapReturning(options.returning))
			: await chain.returning()

		if (!rows[0]) {
			throw new RecordNotCreatedError(this._tableName)
		}
		return rows[0]
	}

	async createMany(
		data: Record<string, unknown>[],
		options?: {
			returning?: Record<string, boolean>
		},
	): Promise<unknown[]> {
		const rows = data.map((d) => this._withCreatedBy(this._autoGeneratePk(d)))
		const db = this._db()
		const chain = db.insert(this._table).values(rows)

		return options?.returning
			? chain.returning(this._mapReturning(options.returning))
			: chain.returning()
	}

	async update(options: {
		where: unknown
		data: Record<string, unknown>
		returning?: Record<string, boolean>
	}): Promise<unknown[]> {
		const db = this._db()
		const condition = this._evaluateWhere(options.where)

		if (!condition) {
			throw new Error(
				'[TableRepository] where condition is required for update',
			)
		}

		const chain = db
			.update(this._table)
			.set(this._withUpdatedBy(options.data))
			.where(condition)

		return options.returning
			? chain.returning(this._mapReturning(options.returning))
			: chain.returning()
	}

	async updateById(
		id: unknown,
		data: Record<string, unknown>,
		options?: {
			expectedVersion?: number
			returning?: Record<string, boolean>
			versionColumn?: string
			with?: Record<string, unknown>
		},
	): Promise<unknown> {
		const guarded = this._withVersionGuard(id, data, options)

		if (options?.with) {
			const updated = await this.update({
				data: guarded.data,
				where: guarded.where,
			})

			if (!updated[0]) {
				await this._failedWrite(id, options)
			}

			const result = await this._refetch(id, {
				columns: options?.returning,
				with: options?.with,
			})

			if (!result) {
				throw new RecordNotFoundError(this._tableName)
			}
			return result
		}

		const rows = await this.update({
			data: guarded.data,
			returning: options?.returning,
			where: guarded.where,
		})

		if (!rows[0]) {
			await this._failedWrite(id, options)
		}
		return rows[0]
	}

	/**
	 * Narrows the write to the version the caller read, and bumps it, so a
	 * concurrent writer that got there first cannot be silently overwritten.
	 */
	private _withVersionGuard(
		id: unknown,
		data: Record<string, unknown>,
		options?: {
			expectedVersion?: number
			versionColumn?: string
		},
	): {
		data: Record<string, unknown>
		where: SQL
	} {
		if (options?.expectedVersion === undefined) {
			return {
				data,
				where: this._pkEq(id),
			}
		}

		const column = options.versionColumn ?? DEFAULT_VERSION_COLUMN
		const columns = getTableColumns(this._table)

		if (!columns[column]) {
			throw new Error(
				`[TableRepository] table "${this._tableName}" has no "${column}" column for optimistic locking`,
			)
		}

		return {
			data: {
				...data,
				[column]: options.expectedVersion + 1,
			},
			where: and(
				this._pkEq(id),
				eq(columns[column], options.expectedVersion as never),
			) as SQL,
		}
	}

	/**
	 * A write that matched nothing is ambiguous: the row may be gone, or another
	 * writer may have moved the version on. Resolving it costs one read, and only
	 * on the failure path.
	 */
	private async _failedWrite(
		id: unknown,
		options?: {
			expectedVersion?: number
			versionColumn?: string
		},
	): Promise<never> {
		if (options?.expectedVersion === undefined) {
			throw new RecordNotFoundError(this._tableName)
		}

		const current = await this._refetch(id, {})

		if (!current) {
			throw new RecordNotFoundError(this._tableName)
		}

		const column = options.versionColumn ?? DEFAULT_VERSION_COLUMN

		throw new ConcurrentUpdateError(
			`[TableRepository] "${this._tableName}" was updated by another writer`,
			{
				actualVersion: (current as Record<string, unknown>)[column],
				expectedVersion: options.expectedVersion,
				table: this._tableName,
			},
		)
	}

	async delete(options: {
		where: unknown
		returning?: Record<string, boolean>
	}): Promise<unknown[]> {
		const db = this._db()
		const condition = this._evaluateWhere(options.where)

		if (!condition) {
			throw new Error(
				'[TableRepository] where condition is required for delete',
			)
		}

		const chain = db.delete(this._table).where(condition)

		return options.returning
			? chain.returning(this._mapReturning(options.returning))
			: chain.returning()
	}

	async deleteById(id: unknown): Promise<unknown> {
		const rows = await this.delete({
			where: this._pkEq(id),
		})
		if (!rows[0]) {
			throw new RecordNotFoundError(this._tableName)
		}
		return rows[0]
	}

	async upsert(options: {
		target: string[]
		create: Record<string, unknown>
		update: Record<string, unknown>
		where?: unknown
		returning?: Record<string, boolean>
		with?: Record<string, unknown>
	}): Promise<unknown> {
		const createData = this._autoGeneratePk(options.create)
		const db = this._db()
		const columns = getTableColumns(this._table)

		const targetRefs = options.target.map((name) => columns[name])

		const conflictOpts: {
			target: unknown[]
			set: Record<string, unknown>
			where?: SQL
		} = {
			set: options.update,
			target: targetRefs,
		}

		if (options.where) {
			conflictOpts.where = this._evaluateWhere(options.where)
		}

		const chain = db
			.insert(this._table)
			.values(createData)
			.onConflictDoUpdate(conflictOpts)

		if (options.with) {
			await chain.returning()

			const result = await this._refetch(createData[this._pkColumn], {
				columns: options.returning,
				with: options.with,
			})

			if (!result) {
				throw new RecordNotCreatedError(this._tableName)
			}
			return result
		}

		const rows = options.returning
			? await chain.returning(this._mapReturning(options.returning))
			: await chain.returning()

		if (!rows[0]) {
			throw new RecordNotCreatedError(this._tableName)
		}
		return rows[0]
	}

	// -----------------------------------------------------------------------
	// Private helpers
	// -----------------------------------------------------------------------

	private _db(): DbProxy {
		return this._getDb() as DbProxy
	}

	/** Stamps the acting principal, when the table declares the column. */
	private _withCreatedBy(
		data: Record<string, unknown>,
	): Record<string, unknown> {
		return withAuditActor(data, getTableColumns(this._table), CREATED_BY_COLUMN)
	}

	/** Stamps the acting principal, when the table declares the column. */
	private _withUpdatedBy(
		data: Record<string, unknown>,
	): Record<string, unknown> {
		return withAuditActor(data, getTableColumns(this._table), UPDATED_BY_COLUMN)
	}

	private _pkEq(id: unknown): SQL {
		const columns = getTableColumns(this._table)
		return eq(columns[this._pkColumn], id as never)
	}

	private _autoGeneratePk(
		data: Record<string, unknown>,
	): Record<string, unknown> {
		if (this._pkHasDefault) {
			return data
		}

		const value = data[this._pkColumn]
		if (value !== undefined && value !== null) {
			return data
		}

		return {
			...data,
			[this._pkColumn]: uuidv7(),
		}
	}

	private async _refetch(
		pkValue: unknown,
		options?: {
			columns?: Record<string, boolean>
			with?: Record<string, unknown>
		},
	): Promise<unknown> {
		return this.findFirst({
			where: this._pkEq(pkValue),
			...(options?.columns && {
				columns: options.columns,
			}),
			...(options?.with && {
				with: options.with,
			}),
		})
	}

	private _mapReturning(
		returning: Record<string, boolean>,
	): Record<string, unknown> {
		const columns = getTableColumns(this._table)
		const result: Record<string, unknown> = {}
		for (const [key, include] of Object.entries(returning)) {
			if (include && columns[key]) {
				result[key] = columns[key]
			}
		}
		return result
	}

	private _evaluateWhere(where: unknown): SQL | undefined {
		if (typeof where === 'function') {
			return (
				where as (fields: unknown, operators: WhereOperators) => SQL | undefined
			)(getTableColumns(this._table), WHERE_OPERATORS)
		}
		return where as SQL | undefined
	}

	private async _applySelectWhere(
		query: SelectChain,
		where: unknown,
	): Promise<Record<string, unknown>[]> {
		const condition = this._evaluateWhere(where)
		if (condition) {
			return query.where(condition)
		}
		return query
	}
}
