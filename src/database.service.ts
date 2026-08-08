import { Injectable } from '@nestjs/common'
import type { Table } from 'drizzle-orm'

import type {
	ResolvedDatabase,
	ResolvedRepositories,
} from '@/database.types.js'

import { getCurrentTx } from '@/drizzle/transaction-context.drizzle.js'
import { TableRepository } from '@/repository/table-repository.js'

@Injectable()
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: dynamic repository augmentation via module declaration merging
export class DatabaseService {
	private readonly _db: unknown

	constructor(db: unknown, schema: Record<string, Table>) {
		this._db = db

		for (const [tableName, table] of Object.entries(schema)) {
			if (tableName in this) {
				throw new Error(
					`[DatabaseModule] table name "${tableName}" is reserved by DatabaseService`,
				)
			}
			;(this as Record<string, unknown>)[tableName] = new TableRepository(
				() => this.raw,
				tableName,
				table,
			)
		}
	}

	get raw(): ResolvedDatabase {
		return (getCurrentTx() ?? this._db) as ResolvedDatabase
	}
}

export interface DatabaseService extends ResolvedRepositories {}
