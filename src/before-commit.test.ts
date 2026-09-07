import { describe, expect, it, vi } from 'vitest'

import {
	onAfterCommit,
	onBeforeCommit,
	registerEngine,
} from '@/transaction.context.js'
import { Transactional } from '@/transactional.js'

import { createPostgresqlAdapter } from '@/drizzle/postgresql.adapter.js'

/** Minimal drizzle stand-in: `transaction` runs the callback and "commits". */
function createDb(options?: { failCommit?: boolean }) {
	const committed: string[] = []

	const db = {
		record: (what: string) => committed.push(what),
		transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
			const tx = {
				record: (what: string) => committed.push(what),
			}

			const result = await fn(tx)

			if (options?.failCommit) {
				throw new Error('commit failed')
			}

			committed.push('COMMIT')

			return result
		}),
	}

	registerFakeEngine(db as never)

	return {
		committed,
		db,
	}
}

function registerFakeEngine(db: { transaction: unknown }): void {
	registerEngine({
		adapter: createPostgresqlAdapter({
			adapter: 'postgresql',
			postgresql: {
				url: 'postgres://unused',
			},
			schemaResolver: () => ({}),
		}),
		client: db,
	})
}

describe('onBeforeCommit', () => {
	it('runs the hook before the commit', async () => {
		const { committed } = createDb()

		class Service {
			@Transactional()
			async execute() {
				onBeforeCommit(async (tx) => {
					;(
						tx as {
							record: (what: string) => void
						}
					).record('outbox insert')
				})

				return 'done'
			}
		}

		await expect(new Service().execute()).resolves.toBe('done')
		expect(committed).toEqual([
			'outbox insert',
			'COMMIT',
		])
	})

	it('hands the hook the transaction handle, not the pool', async () => {
		createDb()
		const received: unknown[] = []

		class Service {
			@Transactional()
			async execute() {
				onBeforeCommit((tx) => {
					received.push(tx)
				})
			}
		}

		await new Service().execute()

		expect(received).toHaveLength(1)
		expect(received[0]).toHaveProperty('record')
	})

	it('runs several hooks in the order they were queued', async () => {
		const { committed } = createDb()

		class Service {
			@Transactional()
			async execute() {
				onBeforeCommit(async (tx) => {
					;(
						tx as {
							record: (what: string) => void
						}
					).record('first')
				})
				onBeforeCommit(async (tx) => {
					;(
						tx as {
							record: (what: string) => void
						}
					).record('second')
				})
			}
		}

		await new Service().execute()

		expect(committed).toEqual([
			'first',
			'second',
			'COMMIT',
		])
	})

	it('reports no transaction in flight so the caller can act immediately', () => {
		createDb()

		expect(onBeforeCommit(() => undefined)).toBe(false)
	})

	it('accepts the hook while a transaction is in flight', async () => {
		createDb()
		let accepted: boolean | undefined

		class Service {
			@Transactional()
			async execute() {
				accepted = onBeforeCommit(() => undefined)
			}
		}

		await new Service().execute()

		expect(accepted).toBe(true)
	})

	it('discards the hook when the operation throws before the commit', async () => {
		const { committed } = createDb()
		const hook = vi.fn()

		class Service {
			@Transactional()
			async execute() {
				onBeforeCommit(hook)
				throw new Error('business rule')
			}
		}

		await expect(new Service().execute()).rejects.toThrow('business rule')
		expect(hook).not.toHaveBeenCalled()
		expect(committed).not.toContain('COMMIT')
	})

	it('fails the transaction when a hook throws, so nothing is committed', async () => {
		const { committed } = createDb()

		class Service {
			@Transactional()
			async execute() {
				onBeforeCommit(async () => {
					throw new Error('outbox insert failed')
				})
			}
		}

		await expect(new Service().execute()).rejects.toThrow(
			'outbox insert failed',
		)
		expect(committed).not.toContain('COMMIT')
	})
})

describe('onAfterCommit', () => {
	it('runs the hook only after the commit succeeded', async () => {
		const { committed } = createDb()

		class Service {
			@Transactional()
			async execute() {
				onAfterCommit(() => {
					committed.push('kick')
				})
			}
		}

		await new Service().execute()

		expect(committed).toEqual([
			'COMMIT',
			'kick',
		])
	})

	it('does not run the hook when the transaction rolled back', async () => {
		createDb()
		const hook = vi.fn()

		class Service {
			@Transactional()
			async execute() {
				onAfterCommit(hook)
				throw new Error('business rule')
			}
		}

		await expect(new Service().execute()).rejects.toThrow('business rule')
		expect(hook).not.toHaveBeenCalled()
	})

	it('does not turn a committed operation into a failure', async () => {
		createDb()

		class Service {
			@Transactional()
			async execute() {
				onAfterCommit(() => {
					throw new Error('dispatcher unreachable')
				})

				return 'done'
			}
		}

		// The data is durable; a failing post-commit hook cannot undo it, so it
		// must not be reported as if the operation failed.
		await expect(new Service().execute()).resolves.toBe('done')
	})

	it('reports no transaction in flight', () => {
		createDb()

		expect(onAfterCommit(() => undefined)).toBe(false)
	})
})
