export { DATABASE_SERVICE } from '@/database.constants.js'
export { DatabaseModule } from '@/database.module.js'
export { DatabaseService } from '@/database.service.js'
export type {
	DatabaseModuleOptions,
	DatabaseRelationsResolver,
	DatabaseSchemaResolver,
	DatabaseServiceRegistry,
	InferDatabase,
	InferDatabaseConfig,
	ResolvedDatabase,
} from '@/database.types.js'

export type {
	MaterializeSchema,
	MaterializeSchemaWithRelations,
} from '@/drizzle/schema-builder.drizzle.js'
export {
	createSchemaBuilder,
	materializeSchema,
} from '@/drizzle/schema-builder.drizzle.js'
export type {
	ColumnMap,
	PgSchemaBuilder,
	RelationsHelpers,
	RelationsResolverResult,
	SchemaBuilder,
	SchemaResolverResult,
} from '@/drizzle/schema-builder.types.drizzle.js'
export type { IsolationLevel } from '@/drizzle/transactional.drizzle.js'
export { Transactional } from '@/drizzle/transactional.drizzle.js'
export {
	RecordNotCreatedError,
	RecordNotFoundError,
} from '@/repository/table-repository.errors.js'
export { TableRepository } from '@/repository/table-repository.js'
export type {
	CountOptions,
	CreateInput,
	CreateOptions,
	DeleteOptions,
	ExistsOptions,
	FindByIdOptions,
	FullTableRepository,
	InferRepositories,
	InferReturning,
	PrimaryKeyInput,
	ReturningColumns,
	TableRepositoryMethods,
	UpdateByIdOptions,
	UpdateInput,
	UpdateOptions,
	UpsertOptions,
	WhereCallback,
	WhereInput,
	WhereOperators,
} from '@/repository/table-repository.types.js'
