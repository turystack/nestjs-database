import { type DynamicModule, Module, type Provider } from '@nestjs/common'
import { ConfigService } from '@turystack/nestjs-config'
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
	>(
		options:
			| DatabaseModuleOptions<TResult, TRelations>
			| ((config: ConfigService) => DatabaseModuleOptions<TResult, TRelations>),
	): DynamicModule {
		return {
			exports: [
				DatabaseService,
				DATABASE_SERVICE,
			],
			global: true,
			module: DatabaseModule,
			providers: DatabaseModule._resolveProviders(options),
		}
	}

	private static _resolveOptions<
		TResult extends SchemaResolverResult,
		TRelations extends RelationsResolverResult | undefined,
	>(
		options:
			| DatabaseModuleOptions<TResult, TRelations>
			| ((config: ConfigService) => DatabaseModuleOptions<TResult, TRelations>),
		config?: ConfigService,
	): DatabaseModuleOptions<TResult, TRelations> {
		if (typeof options !== 'function') {
			return options
		}

		if (!config) {
			throw new Error(
				'[DatabaseModule] register((config) => ...) requires ConfigModule (@turystack/nestjs-config) to be registered',
			)
		}

		return options(config)
	}

	private static _resolveProviders<
		TResult extends SchemaResolverResult,
		TRelations extends RelationsResolverResult | undefined,
	>(
		optionsOrFactory:
			| DatabaseModuleOptions<TResult, TRelations>
			| ((config: ConfigService) => DatabaseModuleOptions<TResult, TRelations>),
	): Provider[] {
		return [
			{
				inject: [
					{
						optional: true,
						token: ConfigService,
					},
				],
				provide: DatabaseService,
				useFactory: async (config?: ConfigService) => {
					const options = DatabaseModule._resolveOptions(
						optionsOrFactory,
						config,
					)
					const tables = materializeSchema(
						options.schemaResolver(createSchemaBuilder()),
					)

					let fullSchema: Record<string, unknown> = {
						...tables,
					}

					if (options.relationsResolver) {
						const relationsResult = options.relationsResolver(tables as never, {
							relations: drizzleRelations,
						})
						fullSchema = {
							...tables,
							...relationsResult,
						}
					}

					const db = await createDrizzleClient(
						options as DatabaseModuleOptions,
						fullSchema,
					)
					registerDb(db)

					return new DatabaseService(db, tables)
				},
			},
			{
				provide: DATABASE_SERVICE,
				useExisting: DatabaseService,
			},
		]
	}
}
