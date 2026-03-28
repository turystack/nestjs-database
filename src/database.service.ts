import { Injectable } from '@nestjs/common'

import type { AdapterStrategy } from '@/drizzle/client.drizzle.js'
import { getCurrentTx } from '@/drizzle/transaction-context.drizzle.js'

/**
 * Provides access to the Drizzle database instance and schema tables.
 *
 * Table accessors are spread directly onto the service instance, so you can
 * access them as `databaseService.user`, `databaseService.post`, etc.
 *
 * The `db` getter automatically returns the active transaction when inside
 * a `@Transactional` context, or the root drizzle instance otherwise.
 *
 * @example
 * ```ts
 * class UserRepository {
 *   constructor(
 *     @Inject(DATABASE_SERVICE)
 *     private readonly db: DatabaseService<{ user: typeof users }>
 *   ) {}
 *
 *   async findAll() {
 *     return this.db.db.select().from(this.db.user)
 *   }
 * }
 * ```
 */
@Injectable()
export class DatabaseService<
	TSchema extends Record<string, unknown> = Record<string, unknown>,
> {
	private readonly _db: unknown
	readonly _strategy: AdapterStrategy

	constructor(db: unknown, schema: TSchema, strategy: AdapterStrategy) {
		this._db = db
		this._strategy = strategy
		Object.assign(this, schema)
	}

	/**
	 * Returns the active transaction if inside a `@Transactional` context,
	 * otherwise returns the root drizzle db instance.
	 */
	get db(): unknown {
		return getCurrentTx() ?? this._db
	}
}
