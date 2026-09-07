import type {
	AnyDynamoTableDefinition,
	DynamoTable,
	InferRow,
} from '@/dynamodb/schema-builder.types.dynamodb.js'

/** A condition on the sort key. The only place a range read is expressible. */
export type SortCondition =
	| {
			beginsWith: string
	  }
	| {
			between: [
				number | string,
				number | string,
			]
	  }
	| {
			eq: number | string
	  }
	| {
			gt: number | string
	  }
	| {
			gte: number | string
	  }
	| {
			lt: number | string
	  }
	| {
			lte: number | string
	  }

/**
 * One page of a query.
 *
 * There is no `page`, no `offset` and no `totalItems`, and that is the whole
 * point: the only honest way to produce them here is to walk the table, and a
 * number that costs a table walk is a trap rather than a number.
 */
export type DynamoPage<TRow> = {
	hasMore: boolean
	items: TRow[]
	nextCursor?: string
}

type Row<TDefinition extends AnyDynamoTableDefinition> = InferRow<
	TDefinition['attributes']
>

/** The attributes that address one item, and only those. */
export type DynamoKeyInput<TDefinition extends AnyDynamoTableDefinition> = Pick<
	Row<TDefinition>,
	(
		| TDefinition['key']['partition']
		| Extract<TDefinition['key']['sort'], string>
	) &
		keyof Row<TDefinition>
>

/**
 * A list read.
 *
 * `index` accepts the names declared in the schema and nothing else, so
 * reaching for a read path that was never designed fails in the editor rather
 * than degrading into a table scan in production.
 */
export type DynamoQueryInput<TDefinition extends AnyDynamoTableDefinition> = {
	cursor?: string
	/** Ascending is the sort key's own order; descending walks it backwards. */
	direction?: 'asc' | 'desc'
	index?: keyof NonNullable<TDefinition['indexes']> & string
	limit?: number
	partition: number | string
	sort?: SortCondition
}

export type DynamoUpdateInput<TDefinition extends AnyDynamoTableDefinition> =
	Partial<Omit<Row<TDefinition>, keyof DynamoKeyInput<TDefinition>>>

export type DynamoUpdateOptions = {
	/**
	 * Version the caller read before deciding the update.
	 *
	 * Lands as a condition on the write itself, so a concurrent writer that got
	 * there first fails this update instead of being overwritten. The engine
	 * settles it atomically — no read-then-write, no isolation level.
	 */
	expectedVersion?: number
	/** Attribute holding the item version. Defaults to `'version'`. */
	versionAttribute?: string
}

/**
 * What a table backed by DynamoDB offers, and no more.
 *
 * Missing on purpose, because the engine has no cheap answer for them:
 * `findMany`/`findFirst` (an arbitrary relational read), `update`/`delete` by
 * predicate (there is no write-by-predicate), and a table-wide `count`.
 */
export interface DynamoRepositoryMethods<
	TDefinition extends AnyDynamoTableDefinition,
> {
	/** Reads one item by its full key. */
	findById(
		key: DynamoKeyInput<TDefinition>,
	): Promise<Row<TDefinition> | undefined>

	/** Reads a page along a declared key path. */
	query(
		input: DynamoQueryInput<TDefinition>,
	): Promise<DynamoPage<Row<TDefinition>>>

	/** Counts within one partition. There is no table-wide count. */
	count(input: DynamoQueryInput<TDefinition>): Promise<number>

	exists(key: DynamoKeyInput<TDefinition>): Promise<boolean>

	create(data: Row<TDefinition>): Promise<Row<TDefinition>>

	createMany(data: Row<TDefinition>[]): Promise<Row<TDefinition>[]>

	/** A put is already an upsert here; this names the intent at the call site. */
	upsert(data: Row<TDefinition>): Promise<Row<TDefinition>>

	updateById(
		key: DynamoKeyInput<TDefinition>,
		data: DynamoUpdateInput<TDefinition>,
		options?: DynamoUpdateOptions,
	): Promise<Row<TDefinition>>

	deleteById(key: DynamoKeyInput<TDefinition>): Promise<Row<TDefinition>>
}

export type InferDynamoRepositories<
	TSchema extends Record<string, DynamoTable>,
> = {
	[K in keyof TSchema & string]: TSchema[K] extends DynamoTable<infer D>
		? DynamoRepositoryMethods<D>
		: never
}
