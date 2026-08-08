import { getTableColumns, getTableName } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
	createSchemaBuilder,
	materializeSchema,
} from '@/drizzle/schema-builder.drizzle.js'

describe('createSchemaBuilder', () => {
	it('should expose the pg column helpers without pgTable', () => {
		const schema = createSchemaBuilder()

		expect(typeof schema.text).toBe('function')
		expect(typeof schema.uuid).toBe('function')
		expect(typeof schema.integer).toBe('function')
		expect(typeof schema.timestamp).toBe('function')
		expect('pgTable' in schema).toBe(false)
	})

	it('should wrap columns in an opaque column map', () => {
		const schema = createSchemaBuilder()

		const result = schema.table({
			id: schema.uuid().primaryKey(),
		})

		expect(Object.keys(result)).toEqual([
			'__columns',
		])
		expect(Object.keys(result.__columns)).toEqual([
			'id',
		])
	})
})

describe('materializeSchema', () => {
	it('should build a drizzle table per resolver key, named after the key', () => {
		const schema = createSchemaBuilder()

		const tables = materializeSchema({
			posts: schema.table({
				id: schema.uuid().primaryKey(),
				title: schema.text().notNull(),
			}),
			users: schema.table({
				id: schema.uuid().primaryKey(),
				name: schema.text().notNull(),
			}),
		})

		expect(getTableName(tables.users)).toBe('users')
		expect(getTableName(tables.posts)).toBe('posts')
		expect(Object.keys(getTableColumns(tables.users))).toEqual([
			'id',
			'name',
		])
		expect(Object.keys(getTableColumns(tables.posts))).toEqual([
			'id',
			'title',
		])
	})
})
