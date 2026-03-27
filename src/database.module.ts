import { type DynamicModule, Module, type Provider } from '@nestjs/common'

import { DATABASE_SERVICE } from '@/database.constants.js'
import { DatabaseService } from '@/database.service.js'
import type { DatabaseModuleOptions } from '@/database.types.js'

import { createDrizzleClient } from '@/drizzle/client.drizzle.js'
import {
	createSchemaBuilder,
	materializeSchema,
} from '@/drizzle/schema-builder.drizzle.js'
import type { SchemaResolverResult } from '@/drizzle/schema-builder.types.drizzle.js'
import { registerDb } from '@/drizzle/transaction-context.drizzle.js'

@Module({})
export class DatabaseModule {
	static register<TResult extends SchemaResolverResult>(
		options: DatabaseModuleOptions<TResult>,
	): DynamicModule {
		return {
			exports: [
				DatabaseService,
				DATABASE_SERVICE,
			],
			module: DatabaseModule,
			providers: DatabaseModule._resolveProviders(options),
		}
	}

	private static _resolveProviders<TResult extends SchemaResolverResult>(
		options: DatabaseModuleOptions<TResult>,
	): Provider[] {
		return [
			{
				provide: DatabaseService,
				useFactory: () => {
					const { db, strategy } = createDrizzleClient(options)
					registerDb(db)

					let schema: Record<string, unknown>

					switch (options.adapter) {
						case 'postgresql': {
							schema = materializeSchema(
								'postgresql',
								options.schemaResolver(createSchemaBuilder('postgresql')),
							)
							break
						}
						case 'mysql': {
							schema = materializeSchema(
								'mysql',
								options.schemaResolver(createSchemaBuilder('mysql')),
							)
							break
						}
						case 'sqlite': {
							schema = materializeSchema(
								'sqlite',
								options.schemaResolver(createSchemaBuilder('sqlite')),
							)
							break
						}
					}

					return new DatabaseService(db, schema, strategy)
				},
			},
			{
				provide: DATABASE_SERVICE,
				useExisting: DatabaseService,
			},
		]
	}
}
