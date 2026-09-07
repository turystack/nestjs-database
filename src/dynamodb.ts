/**
 * The DynamoDB half of the package.
 *
 * A separate entry point for the same reason `postgresql.ts` is one: an
 * application registers a single adapter, and the other engine's factories are
 * not part of its vocabulary. Keeping them in the barrel put twenty-four
 * DynamoDB types in front of every PostgreSQL application, which is how a
 * package with two adapters starts reading like two packages.
 *
 * @example
 * ```ts
 * import {
 *   createDynamoSchemaBuilder,
 *   materializeDynamoSchema,
 * } from '@turystack/nestjs-database/dynamodb'
 * ```
 */
export { DynamoRepository } from '@/dynamodb/dynamodb.repository.js'
export {
	createDynamoSchemaBuilder,
	materializeDynamoSchema,
} from '@/dynamodb/schema-builder.dynamodb.js'
