import type { TransactionOptions } from '@/database.types.js'

/**
 * How a transaction behaves on one engine.
 *
 * Split from {@link IDatabaseAdapter} because `@Transactional` is a bare method
 * decorator with no injection: it reaches the strategy through the registry in
 * `transaction.context.ts`, not through DI, and it has no use for the rest of
 * the adapter.
 */
export interface ITransactionStrategy {
	/**
	 * Runs `work` inside one transaction and returns what it returned.
	 *
	 * The handle passed to `work` is what every repository call inside the tree
	 * will read, so it has to answer the same surface the client does. An engine
	 * that cannot open a handle passes a buffer that collects the writes and
	 * flushes them before this resolves.
	 */
	run<TResult>(
		client: unknown,
		work: (handle: unknown) => Promise<TResult>,
		options?: TransactionOptions,
	): Promise<TResult>
}

/**
 * One engine, behind three questions.
 *
 * Deliberately not the shape of a database client: `TableRepository`'s private
 * `DbProxy` is what Drizzle happens to look like, and asking a key-value store
 * to grow `.select().from()` would be modelling the second engine on the first.
 * What the module actually needs from an engine is these three answers, and
 * each one already lives in its own file today.
 */
export interface IDatabaseAdapter {
	/**
	 * Connects and materializes the schema, together, once at boot.
	 *
	 * Together and not as two calls because the tables the client is built with
	 * and the tables the repositories are built from have to be the same
	 * objects: Drizzle's relational query builder keys off their identity, and
	 * materializing twice would hand out two sets that look alike and are not.
	 */
	initialize(): Promise<{
		client: unknown
		tables: Record<string, unknown>
	}>

	/**
	 * One repository per table.
	 *
	 * `getClient` is read on every call rather than captured, so a transaction
	 * handle in flight substitutes for the client without the repository
	 * knowing a transaction exists.
	 */
	createRepository(input: {
		getClient: () => unknown
		table: unknown
		tableName: string
	}): object

	/** How `@Transactional` runs here. */
	readonly transaction: ITransactionStrategy
}
