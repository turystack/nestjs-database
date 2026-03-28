import type {
	SQL,
	Table,
	InferSelectModel,
	InferInsertModel,
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
} from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Column utilities
// ---------------------------------------------------------------------------

export type TableColumns<TTable extends Table> = TTable['_']['columns']

type PrimaryKeyColumnsMap<TTable extends Table> = {
	[K in keyof TableColumns<TTable> as TableColumns<TTable>[K]['_']['isPrimaryKey'] extends true
		? K
		: never]: TableColumns<TTable>[K]['_']['data']
}

type PKColumnNames<TTable extends Table> = keyof PrimaryKeyColumnsMap<TTable> &
	keyof InferInsertModel<TTable>

// ---------------------------------------------------------------------------
// PK input (single PK only — composite PK not supported)
// ---------------------------------------------------------------------------

export type PrimaryKeyInput<TTable extends Table> =
	PrimaryKeyColumnsMap<TTable>[keyof PrimaryKeyColumnsMap<TTable>]

// ---------------------------------------------------------------------------
// Data input types
// ---------------------------------------------------------------------------

export type CreateInput<TTable extends Table> = Omit<
	InferInsertModel<TTable>,
	PKColumnNames<TTable>
> &
	Partial<Pick<InferInsertModel<TTable>, PKColumnNames<TTable>>>

export type UpdateInput<TTable extends Table> = Partial<
	Omit<InferInsertModel<TTable>, PKColumnNames<TTable>>
>

// ---------------------------------------------------------------------------
// Returning utilities
// ---------------------------------------------------------------------------

export type ReturningColumns<TTable extends Table> = {
	[K in keyof InferSelectModel<TTable>]?: boolean
}

type TrueKeys<T extends Record<string, boolean | undefined>> = {
	[K in keyof T]: T[K] extends true ? K : never
}[keyof T]

export type InferReturning<
	TTable extends Table,
	TReturning extends ReturningColumns<TTable> | undefined,
> = TReturning extends Record<string, boolean | undefined>
	? Pick<
			InferSelectModel<TTable>,
			TrueKeys<TReturning> & keyof InferSelectModel<TTable>
		>
	: InferSelectModel<TTable>

// ---------------------------------------------------------------------------
// Where
// ---------------------------------------------------------------------------

export interface WhereOperators {
	eq: typeof eq
	ne: typeof ne
	gt: typeof gt
	gte: typeof gte
	lt: typeof lt
	lte: typeof lte
	and: typeof and
	or: typeof or
	not: typeof not
	inArray: typeof inArray
	notInArray: typeof notInArray
	isNull: typeof isNull
	isNotNull: typeof isNotNull
	exists: typeof exists
	notExists: typeof notExists
	between: typeof between
	notBetween: typeof notBetween
	like: typeof like
	notLike: typeof notLike
	ilike: typeof ilike
	notIlike: typeof notIlike
	sql: typeof sql
}

export type WhereCallback<TTable extends Table> = (
	fields: TableColumns<TTable>,
	operators: WhereOperators,
) => SQL | undefined

export type WhereInput<TTable extends Table> = WhereCallback<TTable> | SQL

// ---------------------------------------------------------------------------
// With extraction helpers
// ---------------------------------------------------------------------------

type ExtractConfig<T> = T extends (config?: infer C) => unknown ? C : never
type ExtractWith<T> = T extends { with?: infer W } ? W : never

// ---------------------------------------------------------------------------
// Option types
// ---------------------------------------------------------------------------

export interface FindByIdOptions<
	TTable extends Table,
	TWith = Record<string, unknown>,
> {
	columns?: { [K in keyof InferSelectModel<TTable>]?: boolean }
	with?: TWith
}

export interface CreateOptions<
	TTable extends Table,
	TReturning extends ReturningColumns<TTable> | undefined = undefined,
	TWith = Record<string, unknown>,
> {
	returning?: TReturning
	with?: TWith
}

export interface UpdateOptions<
	TTable extends Table,
	TReturning extends ReturningColumns<TTable> | undefined = undefined,
> {
	where: WhereInput<TTable>
	data: UpdateInput<TTable>
	returning?: TReturning
}

export interface UpdateByIdOptions<
	TTable extends Table,
	TReturning extends ReturningColumns<TTable> | undefined = undefined,
	TWith = Record<string, unknown>,
> {
	returning?: TReturning
	with?: TWith
}

export interface DeleteOptions<
	TTable extends Table,
	TReturning extends ReturningColumns<TTable> | undefined = undefined,
> {
	where: WhereInput<TTable>
	returning?: TReturning
}

export interface CountOptions<TTable extends Table> {
	where?: WhereInput<TTable>
}

export interface ExistsOptions<TTable extends Table> {
	where: WhereInput<TTable>
}

export interface UpsertOptions<
	TTable extends Table,
	TReturning extends ReturningColumns<TTable> | undefined = undefined,
	TWith = Record<string, unknown>,
> {
	target: (keyof InferInsertModel<TTable>)[]
	create: CreateInput<TTable>
	update: UpdateInput<TTable>
	where?: WhereInput<TTable>
	returning?: TReturning
	with?: TWith
}

// ---------------------------------------------------------------------------
// Method interface
// ---------------------------------------------------------------------------

export interface TableRepositoryMethods<
	TTable extends Table,
	TWith = Record<string, unknown>,
> {
	findById(
		id: PrimaryKeyInput<TTable>,
		options?: FindByIdOptions<TTable, TWith>,
	): Promise<InferSelectModel<TTable> | undefined>

	create<
		TReturning extends ReturningColumns<TTable> | undefined = undefined,
	>(
		data: CreateInput<TTable>,
		options?: CreateOptions<TTable, TReturning, TWith>,
	): Promise<InferReturning<TTable, TReturning>>

	createMany<
		TReturning extends ReturningColumns<TTable> | undefined = undefined,
	>(
		data: CreateInput<TTable>[],
		options?: { returning?: TReturning },
	): Promise<InferReturning<TTable, TReturning>[]>

	update<
		TReturning extends ReturningColumns<TTable> | undefined = undefined,
	>(
		options: UpdateOptions<TTable, TReturning>,
	): Promise<InferReturning<TTable, TReturning>[]>

	updateById<
		TReturning extends ReturningColumns<TTable> | undefined = undefined,
	>(
		id: PrimaryKeyInput<TTable>,
		data: UpdateInput<TTable>,
		options?: UpdateByIdOptions<TTable, TReturning, TWith>,
	): Promise<InferReturning<TTable, TReturning>>

	delete<
		TReturning extends ReturningColumns<TTable> | undefined = undefined,
	>(
		options: DeleteOptions<TTable, TReturning>,
	): Promise<InferReturning<TTable, TReturning>[]>

	deleteById(id: PrimaryKeyInput<TTable>): Promise<InferSelectModel<TTable>>

	count(options?: CountOptions<TTable>): Promise<number>

	exists(options: ExistsOptions<TTable>): Promise<boolean>

	upsert<
		TReturning extends ReturningColumns<TTable> | undefined = undefined,
	>(
		options: UpsertOptions<TTable, TReturning, TWith>,
	): Promise<InferReturning<TTable, TReturning>>
}

// ---------------------------------------------------------------------------
// Full repository = Drizzle query methods + our mutation methods
// ---------------------------------------------------------------------------

export type FullTableRepository<
	TDb,
	TName extends string,
	TTable extends Table,
> = TDb extends { query: infer Q }
	? TName extends keyof Q
		? Q[TName] extends {
				findMany: infer FM
				findFirst: infer FF
			}
			? TableRepositoryMethods<
					TTable,
					ExtractWith<ExtractConfig<FF>>
				> & { findMany: FM; findFirst: FF }
			: TableRepositoryMethods<TTable>
		: TableRepositoryMethods<TTable>
	: TableRepositoryMethods<TTable>

export type InferRepositories<
	TDb,
	TSchema extends Record<string, Table>,
> = {
	[K in keyof TSchema & string]: FullTableRepository<TDb, K, TSchema[K]>
}
