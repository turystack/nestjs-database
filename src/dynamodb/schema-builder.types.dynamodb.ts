/**
 * The attribute types DynamoDB stores. Deliberately a curated list rather than
 * a spread of a driver's namespace: what the schema can say has to be small
 * enough that the repository types can be derived from it.
 */
export type DynamoAttributeType =
	| 'binary'
	| 'boolean'
	| 'list'
	| 'map'
	| 'number'
	| 'string'

/** A declared attribute: a description, never a driver object. */
export type DynamoAttribute<
	TType extends DynamoAttributeType = DynamoAttributeType,
	TOptional extends boolean = false,
> = {
	readonly __optional: TOptional
	readonly __type: TType
}

export type DynamoAttributes = Record<
	string,
	DynamoAttribute<DynamoAttributeType, boolean>
>

/** Widens the declared type into the TypeScript value it carries. */
type AttributeValue<
	TAttribute extends DynamoAttribute<DynamoAttributeType, boolean>,
> =
	TAttribute extends DynamoAttribute<infer TType, boolean>
		? TType extends 'binary'
			? Uint8Array
			: TType extends 'boolean'
				? boolean
				: TType extends 'list'
					? unknown[]
					: TType extends 'map'
						? Record<string, unknown>
						: TType extends 'number'
							? number
							: string
		: never

type RequiredKeys<TAttributes extends DynamoAttributes> = {
	[K in keyof TAttributes]: TAttributes[K]['__optional'] extends true
		? never
		: K
}[keyof TAttributes]

type OptionalKeys<TAttributes extends DynamoAttributes> = {
	[K in keyof TAttributes]: TAttributes[K]['__optional'] extends true
		? K
		: never
}[keyof TAttributes]

/** The row a table holds, inferred from the declared attributes. */
export type InferRow<TAttributes extends DynamoAttributes> = {
	[K in RequiredKeys<TAttributes>]: AttributeValue<TAttributes[K]>
} & {
	[K in OptionalKeys<TAttributes>]?: AttributeValue<TAttributes[K]>
}

/**
 * A read path: the pair that addresses an item.
 *
 * The base table has one, and every declared index is another. This is what
 * makes `REP-8` structural — a query names one of these or does not compile,
 * so an index cannot be reached for on a hunch.
 */
export type DynamoKey<TAttributes extends DynamoAttributes> = {
	partition: keyof TAttributes & string
	sort?: keyof TAttributes & string
}

export type DynamoIndexes<TAttributes extends DynamoAttributes> = Record<
	string,
	DynamoKey<TAttributes>
>

/**
 * The loose shape every declaration satisfies.
 *
 * The precise `DynamoTableDefinition<TAttributes, TIndexes>` is not assignable
 * to its own default arguments — `keyof TAttributes` narrows where the default
 * widens — so the containers constrain to this instead and keep the precise
 * type as their parameter.
 */
export type AnyDynamoTableDefinition = {
	attributes: DynamoAttributes
	indexes?: Record<
		string,
		{
			partition: string
			sort?: string
		}
	>
	key: {
		partition: string
		sort?: string
	}
}

export type DynamoTableDefinition<
	TAttributes extends DynamoAttributes = DynamoAttributes,
	TIndexes extends DynamoIndexes<TAttributes> = DynamoIndexes<TAttributes>,
> = {
	attributes: TAttributes
	indexes?: TIndexes
	key: DynamoKey<TAttributes>
}

/**
 * Opaque container produced by `schema.table({ … })`.
 *
 * Same two-phase shape the PostgreSQL builder uses: the declaration is carried
 * and the table is only built once the module knows the name, which is the
 * object key.
 */
export type DynamoTableMap<
	TDefinition extends AnyDynamoTableDefinition = AnyDynamoTableDefinition,
> = {
	readonly __definition: TDefinition
}

/** A materialized table: the declaration plus the name it was keyed under. */
export type DynamoTable<
	TDefinition extends AnyDynamoTableDefinition = AnyDynamoTableDefinition,
> = TDefinition & {
	readonly name: string
}

export type DynamoSchemaResolverResult = Record<string, DynamoTableMap>

export type MaterializeDynamoSchema<
	TResult extends DynamoSchemaResolverResult,
> = {
	[K in keyof TResult & string]: TResult[K] extends DynamoTableMap<infer D>
		? DynamoTable<D>
		: never
}

/**
 * The builder handed to `schemaResolver` when the adapter is `dynamodb`.
 *
 * Every helper returns a description, and `.optional()` is the only modifier —
 * there is no `.primaryKey()`, because in DynamoDB the key is a property of the
 * table and not of a column.
 */
export type DynamoSchemaBuilder = {
	binary(): DynamoAttribute<'binary'> & Optionalable<'binary'>
	boolean(): DynamoAttribute<'boolean'> & Optionalable<'boolean'>
	list(): DynamoAttribute<'list'> & Optionalable<'list'>
	map(): DynamoAttribute<'map'> & Optionalable<'map'>
	number(): DynamoAttribute<'number'> & Optionalable<'number'>
	string(): DynamoAttribute<'string'> & Optionalable<'string'>
	table<
		TAttributes extends DynamoAttributes,
		TIndexes extends DynamoIndexes<TAttributes>,
	>(
		definition: DynamoTableDefinition<TAttributes, TIndexes>,
	): DynamoTableMap<DynamoTableDefinition<TAttributes, TIndexes>>
}

type Optionalable<TType extends DynamoAttributeType> = {
	optional(): DynamoAttribute<TType, true>
}
