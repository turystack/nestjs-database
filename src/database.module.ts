import { type DynamicModule, Module, type Provider } from '@nestjs/common'
import { ConfigService } from '@turystack/nestjs-config'

import type { IDatabaseAdapter } from '@/database.adapter.interface.js'
import {
	DATABASE_ADAPTER,
	DATABASE_MODULE_OPTIONS,
	DATABASE_SERVICE,
} from '@/database.constants.js'
import { DatabaseService } from '@/database.service.js'
import type {
	DatabaseAdapterName,
	DatabaseModuleOptions,
} from '@/database.types.js'
import { registerEngine } from '@/transaction.context.js'

import type {
	RelationsResolverResult,
	SchemaResolverResult,
} from '@/drizzle/schema-builder.types.drizzle.js'

/**
 * The engine registry.
 *
 * A record keyed by adapter rather than a `switch`, so a new engine is an entry
 * instead of an edit to the branch that already serves the others (`ADP-5`).
 * The mapped type is what narrows the options per key: the PostgreSQL factory
 * cannot be handed the DynamoDB block by accident.
 */
type AdapterFactories = {
	[K in DatabaseAdapterName]: (
		options: Extract<
			DatabaseModuleOptions,
			{
				adapter: K
			}
		>,
	) => Promise<IDatabaseAdapter>
}

/**
 * Each entry imports its own engine, and only when that engine is the one
 * chosen. A static import here would put both drivers in every consumer's
 * module graph, which is how an "optional" peer quietly becomes required.
 */
const ADAPTERS: AdapterFactories = {
	dynamodb: async (options) => {
		const { createDynamodbAdapter } = await import(
			'@/dynamodb/dynamodb.adapter.js'
		)

		return createDynamodbAdapter(options)
	},
	postgresql: async (options) => {
		const { createPostgresqlAdapter } = await import(
			'@/drizzle/postgresql.adapter.js'
		)

		return createPostgresqlAdapter(options)
	},
}

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
				DATABASE_ADAPTER,
			],
			global: true,
			module: DatabaseModule,
			providers: DatabaseModule._resolveProviders(options),
		}
	}

	private static async _createAdapter(
		options: DatabaseModuleOptions,
	): Promise<IDatabaseAdapter> {
		// Indexing the record with a union gives a function whose parameter is the
		// intersection of every arm, which is `never`. The cast is confined to
		// this line; what protects the arms is the mapped type on ADAPTERS, where
		// each factory is still declared against its own options.
		const factory = ADAPTERS[options.adapter] as
			| ((options: DatabaseModuleOptions) => Promise<IDatabaseAdapter>)
			| undefined

		if (!factory) {
			throw new Error(
				`[DatabaseModule] unknown adapter "${options.adapter}" — known adapters: ${Object.keys(ADAPTERS).join(', ')}`,
			)
		}

		return factory(options)
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
				provide: DATABASE_MODULE_OPTIONS,
				useFactory: (config?: ConfigService) =>
					DatabaseModule._resolveOptions(optionsOrFactory, config),
			},
			{
				inject: [
					DATABASE_MODULE_OPTIONS,
				],
				provide: DATABASE_ADAPTER,
				useFactory: (options: DatabaseModuleOptions) =>
					DatabaseModule._createAdapter(options),
			},
			{
				inject: [
					DATABASE_ADAPTER,
				],
				provide: DatabaseService,
				useFactory: async (adapter: IDatabaseAdapter) => {
					const { client, tables } = await adapter.initialize()

					registerEngine({
						adapter,
						client,
					})

					return new DatabaseService(adapter, client, tables)
				},
			},
			{
				provide: DATABASE_SERVICE,
				useExisting: DatabaseService,
			},
		]
	}
}
