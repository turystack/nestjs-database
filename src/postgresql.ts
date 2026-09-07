/**
 * The PostgreSQL half of the package.
 *
 * A separate entry point because everything here imports `drizzle-orm` at
 * module scope. Re-exporting it from the package barrel would force every
 * consumer to install Drizzle, including an app that only ever registers
 * `adapter: 'dynamodb'` — which is how an optional peer quietly becomes a
 * required one.
 *
 * @example
 * ```ts
 * import {
 *   createSchemaBuilder,
 *   materializeSchema,
 * } from '@turystack/nestjs-database/postgresql'
 * ```
 */
export {
	createSchemaBuilder,
	materializeSchema,
} from '@/drizzle/schema-builder.drizzle.js'
export { TableRepository } from '@/repository/table-repository.js'
