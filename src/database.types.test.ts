import { describe, expectTypeOf, it } from 'vitest'

import { defineDatabaseSchema } from '@/database.helpers.js'
import type { InferDatabaseConfig } from '@/database.types.js'

import type { MaterializeSchema } from '@/drizzle/schema-builder.drizzle.js'
import type {
	CreateInput,
	InferReturning,
	PrimaryKeyInput,
	UpdateInput,
} from '@/repository/table-repository.types.js'

const databaseSchema = defineDatabaseSchema((schema) => ({
	users: schema.table({
		bio: schema.text(),
		id: schema.uuid().primaryKey(),
		name: schema.text().notNull(),
	}),
}))

type Tables = MaterializeSchema<ReturnType<typeof databaseSchema>>
type Users = Tables['users']
type Config = InferDatabaseConfig<ReturnType<typeof databaseSchema>>

describe('schema inference', () => {
	it('should materialize tables keyed and named by the resolver keys', () => {
		expectTypeOf<keyof Tables>().toEqualTypeOf<'users'>()
		expectTypeOf<Users['_']['name']>().toEqualTypeOf<'users'>()
	})

	it('should infer the primary key input type', () => {
		expectTypeOf<PrimaryKeyInput<Users>>().toEqualTypeOf<string>()
	})

	it('should make the primary key optional on create input', () => {
		expectTypeOf<CreateInput<Users>['id']>().toEqualTypeOf<string | undefined>()
		expectTypeOf<CreateInput<Users>['name']>().toEqualTypeOf<string>()
		expectTypeOf<CreateInput<Users>['bio']>().toEqualTypeOf<
			string | null | undefined
		>()
	})

	it('should exclude the primary key from update input', () => {
		expectTypeOf<keyof UpdateInput<Users>>().toEqualTypeOf<'bio' | 'name'>()
	})

	it('should narrow returning columns to the selected keys', () => {
		expectTypeOf<
			InferReturning<
				Users,
				{
					id: true
				}
			>
		>().toEqualTypeOf<{
			id: string
		}>()
		expectTypeOf<InferReturning<Users, undefined>>().toEqualTypeOf<{
			bio: string | null
			id: string
			name: string
		}>()
	})

	it('should build the registry config from the schema resolver', () => {
		expectTypeOf<Config['schema']>().toEqualTypeOf<Tables>()
		expectTypeOf<Config['raw']['query']>().toHaveProperty('users')
	})
})
