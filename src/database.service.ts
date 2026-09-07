import { Injectable } from '@nestjs/common'

import type { IDatabaseAdapter } from '@/database.adapter.interface.js'
import type {
	ResolvedDatabase,
	ResolvedRepositories,
} from '@/database.types.js'
import { getCurrentTx } from '@/transaction.context.js'

@Injectable()
export class DatabaseService {
	private readonly _db: unknown

	constructor(
		adapter: IDatabaseAdapter,
		db: unknown,
		schema: Record<string, unknown>,
	) {
		this._db = db

		for (const [tableName, table] of Object.entries(schema)) {
			if (tableName in this) {
				throw new Error(
					`[DatabaseModule] table name "${tableName}" is reserved by DatabaseService`,
				)
			}
			;(this as Record<string, unknown>)[tableName] = adapter.createRepository({
				getClient: () => this.raw,
				table,
				tableName,
			})
		}
	}

	get raw(): ResolvedDatabase {
		return (getCurrentTx() ?? this._db) as ResolvedDatabase
	}
}

export interface DatabaseService extends ResolvedRepositories {}
