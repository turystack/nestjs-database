import { getTableColumns, getTableName, sql } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
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

	it('should keep the container free of a constraints key when none are given', () => {
		const schema = createSchemaBuilder()

		// A table with no constraints is the common case, and an
		// always-present `undefined` would appear in every snapshot of the map.
		expect(
			'__constraints' in
				schema.table({
					id: schema.uuid().primaryKey(),
				}),
		).toBe(false)
	})

	it('should expose the constraint builders, which live beside the columns', () => {
		const schema = createSchemaBuilder()

		expect(typeof schema.uniqueIndex).toBe('function')
		expect(typeof schema.index).toBe('function')
		expect(typeof schema.unique).toBe('function')
		expect(typeof schema.check).toBe('function')
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

/**
 * The third argument of `pgTable`.
 *
 * It was not passed through at all, so a generated schema could declare a
 * column and nothing else: no `unique(organization_id, slug)`, no partial
 * index, no check. Every scoped uniqueness rule the modelling law requires was
 * unexpressable, and the omission was silent — the table built fine, just
 * without the constraint.
 */
describe('table constraints', () => {
	it('carries a unique index through to the built table', () => {
		const schema = createSchemaBuilder()

		const tables = materializeSchema({
			workspaces: schema.table(
				{
					organizationId: schema.uuid().notNull(),
					slug: schema.text().notNull(),
					workspaceId: schema.uuid().primaryKey(),
				},
				(table) => [
					schema
						.uniqueIndex('workspace_organization_slug')
						.on(table.organizationId, table.slug),
				],
			),
		})

		const [index] = getTableConfig(tables.workspaces).indexes

		expect(index?.config.name).toBe('workspace_organization_slug')
		expect(index?.config.unique).toBe(true)
		expect(
			index?.config.columns.map((column) =>
				'name' in column ? column.name : undefined,
			),
		).toEqual([
			'organizationId',
			'slug',
		])
	})

	it('carries a partial unique index, which is how one default per parent is stated', () => {
		const schema = createSchemaBuilder()

		const tables = materializeSchema({
			workspaces: schema.table(
				{
					isDefault: schema.boolean().notNull(),
					organizationId: schema.uuid().notNull(),
					workspaceId: schema.uuid().primaryKey(),
				},
				(table) => [
					schema
						.uniqueIndex('workspace_one_default')
						.on(table.organizationId)
						.where(sql`is_default`),
				],
			),
		})

		const [index] = getTableConfig(tables.workspaces).indexes

		expect(index?.config.name).toBe('workspace_one_default')
		expect(index?.config.where).toBeDefined()
	})

	it('leaves a table with no constraints exactly as it was', () => {
		const schema = createSchemaBuilder()

		const tables = materializeSchema({
			users: schema.table({
				userId: schema.uuid().primaryKey(),
			}),
		})

		expect(getTableConfig(tables.users).indexes).toEqual([])
		expect(getTableName(tables.users)).toBe('users')
	})
})

describe('table naming', () => {
	it('names the table in snake case while the accessor stays camel case', () => {
		const schema = createSchemaBuilder()

		const tables = materializeSchema({
			userSocialIdentity: schema.table({
				userSocialIdentityId: schema.uuid().primaryKey(),
			}),
		})

		// The key is the accessor a repository is reached by; the name is what
		// psql shows. Drizzle's `casing` converts the columns and not this.
		expect(getTableName(tables.userSocialIdentity)).toBe('user_social_identity')
	})

	it('leaves a name that is already one word alone', () => {
		const schema = createSchemaBuilder()

		const tables = materializeSchema({
			user: schema.table({
				userId: schema.uuid().primaryKey(),
			}),
		})

		expect(getTableName(tables.user)).toBe('user')
	})
})
