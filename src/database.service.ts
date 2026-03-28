import { Injectable } from '@nestjs/common'

import type { Table } from 'drizzle-orm'

import type {
	ResolvedDatabase,
	ResolvedRepositories,
} from '@/database.types.js'
import type { AdapterStrategy } from '@/drizzle/client.drizzle.js'
import { getCurrentTx } from '@/drizzle/transaction-context.drizzle.js'
import { TableRepository } from '@/repository/table-repository.js'

@Injectable()
export class DatabaseService {
	private readonly _db: unknown
	readonly _strategy: AdapterStrategy

	constructor(
		db: unknown,
		schema: Record<string, Table>,
		strategy: AdapterStrategy,
	) {
		this._db = db
		this._strategy = strategy

		for (const [tableName, table] of Object.entries(schema)) {
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

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: dynamic repository augmentation via module declaration merging
export interface DatabaseService extends ResolvedRepositories {}
