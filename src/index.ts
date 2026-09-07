/**
 * The engine-neutral surface: the factories, the wiring, and the contract.
 *
 * What is deliberately absent is the type machinery. `CreateInput`,
 * `WhereCallback`, `DynamoQueryInput`, `PgSchemaBuilder` and the rest still
 * exist and still type every call — they are simply not nameable through an
 * import, because naming them is how an application starts writing signatures
 * against this package's internals instead of against its own domain.
 *
 * Inference is unaffected: `db.users.findById(id)` returns the row type it
 * always did. What changes is that the row type has one source, the schema.
 *
 * Engine-specific factories live behind their own entry points —
 * `@turystack/nestjs-database/postgresql` and `/dynamodb` — so an application
 * that registers one adapter never resolves the other's types, and never
 * installs the peer behind it.
 */

export type { AuditActorReader } from '@/audit.context.js'
export {
	currentAuditActor,
	registerAuditActor,
} from '@/audit.context.js'
export { DATABASE_SERVICE } from '@/database.constants.js'
export {
	defineDatabaseRelations,
	defineDatabaseSchema,
	defineDynamoDatabaseSchema,
} from '@/database.helpers.js'
export { DatabaseModule } from '@/database.module.js'
export { DatabaseService } from '@/database.service.js'
export type {
	DatabaseModuleOptions,
	DatabaseServiceRegistry,
	InferDatabaseConfig,
	InferDynamoDatabaseConfig,
} from '@/database.types.js'
export {
	getCurrentTx,
	onAfterCommit,
	onBeforeCommit,
	transactionState,
} from '@/transaction.context.js'
export type { IsolationLevel } from '@/transactional.js'
export { Transactional } from '@/transactional.js'

/**
 * The names the three factories above return.
 *
 * They are exported for one reason: an application that declares its schema in
 * a workspace package emits a `.d.ts` for it, and TypeScript refuses to write
 * a declaration whose inferred type it cannot name (TS2883). Hiding these made
 * every generated repository fail its own build.
 *
 * They are not meant to be written by hand. A signature that names
 * `ColumnMap` or `DynamoTableMap` is a signature written against this
 * package's internals; the schema is the one place these belong, and
 * inference puts them there without anyone typing them.
 */
export type { MaterializeSchema } from '@/drizzle/schema-builder.drizzle.js'
export type {
	ColumnMap,
	PgSchemaBuilder,
	RelationsHelpers,
} from '@/drizzle/schema-builder.types.drizzle.js'
export type {
	DynamoAttribute,
	DynamoIndexes,
	DynamoSchemaBuilder,
	DynamoTableDefinition,
	DynamoTableMap,
} from '@/dynamodb/schema-builder.types.dynamodb.js'
export {
	RecordNotCreatedError,
	RecordNotFoundError,
} from '@/repository/table-repository.errors.js'
