import type { DynamodbOptions } from '@/database.types.js'

/**
 * The slice of the AWS SDK this adapter uses, declared here rather than
 * imported.
 *
 * `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` are optional peers: an
 * app on PostgreSQL must not have to install them. A static import would defeat
 * that even behind a dynamic factory, because importing this module would pull
 * the SDK in regardless — which is the trap `nestjs-storage` and
 * `nestjs-publisher` fall into today. Declaring the shape and resolving it
 * lazily is the pattern that actually holds.
 */
type CommandConstructor = new (input: Record<string, unknown>) => object

export type DynamoDocumentClient = {
	send(command: object): Promise<Record<string, unknown>>
}

export type DynamoSdk = {
	BatchWriteCommand: CommandConstructor
	DeleteCommand: CommandConstructor
	GetCommand: CommandConstructor
	PutCommand: CommandConstructor
	QueryCommand: CommandConstructor
	TransactWriteCommand: CommandConstructor
	UpdateCommand: CommandConstructor
}

export type DynamoConnection = {
	client: DynamoDocumentClient
	sdk: DynamoSdk
	tablePrefix: string
}

const MISSING_SDK =
	'[DatabaseModule] adapter "dynamodb" needs @aws-sdk/client-dynamodb and @aws-sdk/lib-dynamodb — install them, or use another adapter'

export async function createDynamoConnection(
	options: DynamodbOptions,
): Promise<DynamoConnection> {
	let core: Record<string, unknown>
	let lib: Record<string, unknown>

	// Non-literal specifiers on purpose: a literal makes TypeScript resolve the
	// module at build time, which turns an optional peer into a required one for
	// everybody who only ever uses PostgreSQL.
	const corePackage = '@aws-sdk/client-dynamodb'
	const libPackage = '@aws-sdk/lib-dynamodb'

	try {
		core = (await import(corePackage)) as Record<string, unknown>
		lib = (await import(libPackage)) as Record<string, unknown>
	} catch {
		throw new Error(MISSING_SDK)
	}

	const DynamoDBClient = core.DynamoDBClient as new (
		config: Record<string, unknown>,
	) => object
	const DynamoDBDocumentClient = lib.DynamoDBDocumentClient as {
		from(
			client: object,
			options?: Record<string, unknown>,
		): DynamoDocumentClient
	}

	const base = new DynamoDBClient({
		...(options.credentials
			? {
					credentials: options.credentials,
				}
			: {}),
		...(options.endpoint
			? {
					endpoint: options.endpoint,
				}
			: {}),
		region: options.region,
	})

	return {
		client: DynamoDBDocumentClient.from(base, {
			marshallOptions: {
				removeUndefinedValues: true,
			},
		}),
		sdk: lib as unknown as DynamoSdk,
		tablePrefix: options.tablePrefix ?? '',
	}
}
