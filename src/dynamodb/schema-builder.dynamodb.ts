import type {
	DynamoAttribute,
	DynamoAttributeType,
	DynamoSchemaBuilder,
	DynamoSchemaResolverResult,
	DynamoTable,
	DynamoTableDefinition,
	DynamoTableMap,
	MaterializeDynamoSchema,
} from '@/dynamodb/schema-builder.types.dynamodb.js'

function attribute<TType extends DynamoAttributeType>(type: TType) {
	return {
		__optional: false as const,
		__type: type,
		optional(): DynamoAttribute<TType, true> {
			return {
				__optional: true,
				__type: type,
			}
		},
	}
}

export function createDynamoSchemaBuilder(): DynamoSchemaBuilder {
	return {
		binary: () => attribute('binary'),
		boolean: () => attribute('boolean'),
		list: () => attribute('list'),
		map: () => attribute('map'),
		number: () => attribute('number'),
		string: () => attribute('string'),
		table: (definition) =>
			({
				__definition: definition,
			}) as DynamoTableMap<typeof definition>,
	}
}

/**
 * Checks a declaration against itself before anything is stored.
 *
 * A key naming an attribute that was never declared is the kind of typo that a
 * key-value store answers with an empty page rather than an error, so it is
 * caught here, at boot, where it is still cheap.
 */
function assertKeysExist(
	tableName: string,
	definition: DynamoTableDefinition,
): void {
	const declared = new Set(Object.keys(definition.attributes))
	const paths: Array<
		[
			string,
			{
				partition: string
				sort?: string
			},
		]
	> = [
		[
			'key',
			definition.key,
		],
		...Object.entries(definition.indexes ?? {}),
	]

	for (const [label, key] of paths) {
		for (const attributeName of [
			key.partition,
			key.sort,
		]) {
			if (attributeName !== undefined && !declared.has(attributeName)) {
				throw new Error(
					`[DatabaseModule] table "${tableName}" declares "${attributeName}" in ${label}, but no such attribute exists`,
				)
			}
		}
	}
}

export function materializeDynamoSchema<
	TResult extends DynamoSchemaResolverResult,
>(resolverResult: TResult): MaterializeDynamoSchema<TResult>
export function materializeDynamoSchema(
	resolverResult: DynamoSchemaResolverResult,
): Record<string, DynamoTable> {
	return Object.fromEntries(
		Object.entries(resolverResult).map(([tableName, tableMap]) => {
			assertKeysExist(tableName, tableMap.__definition)

			return [
				tableName,
				{
					...tableMap.__definition,
					name: tableName,
				},
			]
		}),
	)
}
