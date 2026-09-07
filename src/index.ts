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

export {
	RecordNotCreatedError,
	RecordNotFoundError,
} from '@/repository/table-repository.errors.js'
