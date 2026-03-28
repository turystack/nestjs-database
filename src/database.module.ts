import { type DynamicModule, Module, type Provider } from '@nestjs/common'
import type { Table } from 'drizzle-orm'
import { relations as drizzleRelations } from 'drizzle-orm'

import { DATABASE_SERVICE } from '@/database.constants.js'
import { DatabaseService } from '@/database.service.js'
import type { DatabaseModuleOptions } from '@/database.types.js'

import { createDrizzleClient } from '@/drizzle/client.drizzle.js'
import {
	createSchemaBuilder,
	materializeSchema,
} from '@/drizzle/schema-builder.drizzle.js'
import type {
	RelationsResolverResult,
	SchemaResolverResult,
} from '@/drizzle/schema-builder.types.drizzle.js'
import { registerDb } from '@/drizzle/transaction-context.drizzle.js'

@Module({})
export class DatabaseModule {
	static register<
		TResult extends SchemaResolverResult,
		TRelations extends RelationsResolverResult | undefined = undefined,
	>(options: DatabaseModuleOptions<TResult, TRelations>): DynamicModule {
		return {
			exports: [DatabaseService, DATABASE_SERVICE],
			module: DatabaseModule,
			providers: DatabaseModule._resolveProviders(options),
		}
	}

	private static _resolveProviders<
		TResult extends SchemaResolverResult,
		TRelations extends RelationsResolverResult | undefined,
	>(options: DatabaseModuleOptions<TResult, TRelations>): Provider[] {
		return [
			{
				provide: DatabaseService,
				useFactory: async () => {
					const tables = materializeSchema(
						options.schemaResolver(createSchemaBuilder()),
					)

					let fullSchema: Record<string, unknown> = { ...tables }

					if (options.relationsResolver) {
						const relationsResult = options.relationsResolver(
							tables as never,
							{ relations: drizzleRelations },
						)
						fullSchema = { ...tables, ...relationsResult }
					}

					const { db, strategy } = await createDrizzleClient(
						options as DatabaseModuleOptions,
						fullSchema,
					)
					registerDb(db)

					return new DatabaseService(db, tables, strategy)
				},
			},
			{
				provide: DATABASE_SERVICE,
				useExisting: DatabaseService,
			},
		]
	}
}
