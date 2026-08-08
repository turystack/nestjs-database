import { Injectable, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ConfigModule } from '@turystack/nestjs-config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { DATABASE_SERVICE } from '@/database.constants.js'
import {
	defineDatabaseRelations,
	defineDatabaseSchema,
} from '@/database.helpers.js'
import { DatabaseModule } from '@/database.module.js'
import { DatabaseService } from '@/database.service.js'

import { TableRepository } from '@/repository/table-repository.js'

const TEST_URL = 'postgres://user:pass@localhost:5432/app'

afterEach(() => {
	vi.unstubAllEnvs()
})

const databaseSchema = defineDatabaseSchema((schema) => ({
	posts: schema.table({
		authorId: schema.uuid().notNull(),
		id: schema.uuid().primaryKey(),
		title: schema.text().notNull(),
	}),
	users: schema.table({
		id: schema.uuid().primaryKey(),
		name: schema.text().notNull(),
	}),
}))

const databaseRelations = defineDatabaseRelations(
	databaseSchema,
	(tables, { relations }) => ({
		usersRelations: relations(tables.users, ({ many }) => ({
			posts: many(tables.posts),
		})),
	}),
)

// Domain lib pattern: the service only injects DatabaseService — the module
// never imports DatabaseModule, which is registered once by the app root.
@Injectable()
class DomainService {
	constructor(readonly db: DatabaseService) {}
}

@Module({
	exports: [
		DomainService,
	],
	providers: [
		DomainService,
	],
})
class DomainLibModule {}

describe('DatabaseModule', () => {
	it('should expose one typed repository per schema table', async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [
				DatabaseModule.register({
					adapter: 'postgresql',
					postgresql: {
						url: TEST_URL,
					},
					schemaResolver: databaseSchema,
				}),
			],
		}).compile()

		const service = moduleRef.get(DatabaseService) as DatabaseService &
			Record<string, unknown>

		expect(service.users).toBeInstanceOf(TableRepository)
		expect(service.posts).toBeInstanceOf(TableRepository)
		expect(service.raw).toBeDefined()
	})

	it('should inject into domain services without importing the module (global)', async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [
				DatabaseModule.register({
					adapter: 'postgresql',
					postgresql: {
						url: TEST_URL,
					},
					schemaResolver: databaseSchema,
				}),
				DomainLibModule,
			],
		}).compile()

		const domainService = moduleRef.get(DomainService)
		const db = domainService.db as DatabaseService & Record<string, unknown>

		expect(domainService.db).toBeInstanceOf(DatabaseService)
		expect(db.users).toBeInstanceOf(TableRepository)
	})

	it('should expose the same instance under the DATABASE_SERVICE token', async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [
				DatabaseModule.register({
					adapter: 'postgresql',
					postgresql: {
						url: TEST_URL,
					},
					schemaResolver: databaseSchema,
				}),
			],
		}).compile()

		expect(moduleRef.get(DATABASE_SERVICE)).toBe(moduleRef.get(DatabaseService))
	})

	it('should resolve relations through the relations resolver', async () => {
		const relationsSpy = vi.fn(databaseRelations)

		const moduleRef = await Test.createTestingModule({
			imports: [
				DatabaseModule.register({
					adapter: 'postgresql',
					postgresql: {
						url: TEST_URL,
					},
					relationsResolver: relationsSpy,
					schemaResolver: databaseSchema,
				}),
			],
		}).compile()

		moduleRef.get(DatabaseService)

		expect(relationsSpy).toHaveBeenCalledTimes(1)
		const [tables] = relationsSpy.mock.calls[0]
		expect(Object.keys(tables)).toEqual([
			'posts',
			'users',
		])
	})

	it('should mark the dynamic module as global', () => {
		const dynamicModule = DatabaseModule.register({
			adapter: 'postgresql',
			postgresql: {
				url: TEST_URL,
			},
			schemaResolver: databaseSchema,
		})

		expect(dynamicModule.global).toBe(true)
	})

	it('should resolve options from a config factory', async () => {
		vi.stubEnv('DATABASE_URL', TEST_URL)

		const moduleRef = await Test.createTestingModule({
			imports: [
				ConfigModule.register({
					envFilePath: false,
					schema: {
						DATABASE_URL: z.string(),
					},
				}),
				DatabaseModule.register((config) => ({
					adapter: 'postgresql',
					postgresql: {
						url: config.get('DATABASE_URL') as string,
					},
					schemaResolver: databaseSchema,
				})),
			],
		}).compile()

		const service = moduleRef.get(DatabaseService) as DatabaseService &
			Record<string, unknown>

		expect(service.users).toBeInstanceOf(TableRepository)
	})

	it('should reject a config factory without ConfigModule', async () => {
		await expect(
			Test.createTestingModule({
				imports: [
					DatabaseModule.register((config) => ({
						adapter: 'postgresql',
						postgresql: {
							url: config.get('DATABASE_URL') as string,
						},
						schemaResolver: databaseSchema,
					})),
				],
			}).compile(),
		).rejects.toThrow(
			'requires ConfigModule (@turystack/nestjs-config) to be registered',
		)
	})

	it('should reject schema tables named after DatabaseService members', async () => {
		const reservedSchema = defineDatabaseSchema((schema) => ({
			raw: schema.table({
				id: schema.uuid().primaryKey(),
			}),
		}))

		await expect(
			Test.createTestingModule({
				imports: [
					DatabaseModule.register({
						adapter: 'postgresql',
						postgresql: {
							url: TEST_URL,
						},
						schemaResolver: reservedSchema,
					}),
				],
			}).compile(),
		).rejects.toThrow('table name "raw" is reserved')
	})
})
