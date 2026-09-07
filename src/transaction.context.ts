import { AsyncLocalStorage } from 'node:async_hooks'

import type { IDatabaseAdapter } from '@/database.adapter.interface.js'
import type { ResolvedDatabase } from '@/database.types.js'

export const transactionStorage = new AsyncLocalStorage<ResolvedDatabase>()

export function getCurrentTx(): ResolvedDatabase | undefined {
	return transactionStorage.getStore()
}

/** Runs on the transaction handle right before the commit. */
export type BeforeCommitHook = (tx: ResolvedDatabase) => Promise<void> | void

/**
 * Hooks queued by the operation in flight, drained by {@link Transactional}
 * just before the commit.
 *
 * Kept in its own storage so the shape of {@link transactionStorage} — read by
 * every repository call — stays untouched.
 */
export const beforeCommitStorage = new AsyncLocalStorage<BeforeCommitHook[]>()

/**
 * Queues work to run inside the transaction in flight, immediately before the
 * commit.
 *
 * The write lands atomically with everything else the operation did: a rollback
 * discards both. Used by the transactional outbox, where an event row has to
 * share the fate of the row that produced it.
 *
 * @returns `false` when there is no transaction in flight, so the caller can
 * fall back to acting immediately.
 */
export function onBeforeCommit(hook: BeforeCommitHook): boolean {
	const hooks = beforeCommitStorage.getStore()

	if (!hooks) {
		return false
	}

	hooks.push(hook)

	return true
}

/** Scratch space scoped to the transaction in flight. */
export const transactionStateStorage = new AsyncLocalStorage<
	Map<symbol, unknown>
>()

/**
 * Per-transaction state, created on first access.
 *
 * Lets a consumer accumulate across an operation — the outbox buffers its rows
 * here so one commit costs one batched insert instead of one per publish.
 * Instance-level state would be wrong: two operations run concurrently in the
 * same process and would share the buffer.
 *
 * @returns `undefined` when there is no transaction in flight.
 */
export function transactionState<T>(
	key: symbol,
	create: () => T,
): T | undefined {
	const state = transactionStateStorage.getStore()

	if (!state) {
		return undefined
	}

	if (!state.has(key)) {
		state.set(key, create())
	}

	return state.get(key) as T
}

/** Runs once the commit succeeded. */
export type AfterCommitHook = () => Promise<void> | void

/** Hooks queued for after the commit, drained by {@link Transactional}. */
export const afterCommitStorage = new AsyncLocalStorage<AfterCommitHook[]>()

/**
 * Queues work to run **after** the commit succeeded.
 *
 * For effects that must not happen unless the data is durable, and that cannot
 * undo it either — waking a dispatcher, warming a cache. A failure here cannot
 * fail the transaction, which is already committed, so it is reported and
 * swallowed rather than thrown.
 *
 * @returns `false` when there is no transaction in flight.
 */
export function onAfterCommit(hook: AfterCommitHook): boolean {
	const hooks = afterCommitStorage.getStore()

	if (!hooks) {
		return false
	}

	hooks.push(hook)

	return true
}

/**
 * The engine, reachable without injection.
 *
 * `@Transactional` is a bare method decorator: it has no constructor and no
 * container, so this is how it finds the connection. Keeping the adapter here
 * rather than the raw client is what lets the decorator stay engine-agnostic —
 * it asks the adapter how a transaction runs instead of assuming the client
 * has a `.transaction()`.
 */
type RegisteredEngine = {
	adapter: IDatabaseAdapter
	client: unknown
}

let _engine: RegisteredEngine | undefined

export function registerEngine(engine: RegisteredEngine): void {
	_engine = engine
}

export function getEngine(): RegisteredEngine {
	if (!_engine) {
		throw new Error(
			'[DatabaseModule] engine not initialized — was DatabaseModule.register() called?',
		)
	}

	return _engine
}

/** The connection, outside any transaction. */
export function getDb(): ResolvedDatabase {
	return getEngine().client as ResolvedDatabase
}
