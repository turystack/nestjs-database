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
				provide: DATABASE_SERVICE,
				useFactory: () => {
					const { db, strategy } = createDrizzleClient(options)
					registerDb(db)

					const builder = createSchemaBuilder()
					const resolverResult = options.schemaResolver(builder)
					const schema = materializeSchema(options.adapter, resolverResult)

					return new DatabaseService(db, schema, strategy)
				},
			},
		]
	}
}
