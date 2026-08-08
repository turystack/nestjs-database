import { afterEach, describe, expect, it, vi } from 'vitest'

import {
	getCurrentTx,
	registerDb,
	transactionStorage,
} from '@/drizzle/transaction-context.drizzle.js'
import { Transactional } from '@/drizzle/transactional.drizzle.js'

const FAKE_TX = {
	tx: true,
}

function createFakeDb() {
	return {
		transaction: vi.fn(
			async (
				fn: (tx: unknown) => Promise<unknown>,
				_config?: {
					isolationLevel?: string
				},
			) => fn(FAKE_TX),
		),
	}
}

class OrderService {
	@Transactional()
	async place(): Promise<unknown> {
		return getCurrentTx()
	}

	@Transactional('serializable')
	async placeSerializable(): Promise<unknown> {
		return getCurrentTx()
	}
}

describe('transaction context', () => {
	it('should throw from getDb before any module registered a db', async () => {
		vi.resetModules()
		const { getDb } = await import('@/drizzle/transaction-context.drizzle.js')

		expect(() => getDb()).toThrow('db not initialized')
	})

	it('should return undefined from getCurrentTx outside a transaction', () => {
		expect(getCurrentTx()).toBeUndefined()
	})
})

describe('Transactional', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('should run the method inside a new transaction', async () => {
		const db = createFakeDb()
		registerDb(db as never)
		const service = new OrderService()

		const result = await service.place()

		expect(db.transaction).toHaveBeenCalledTimes(1)
		expect(db.transaction.mock.calls[0][1]).toBeUndefined()
		expect(result).toBe(FAKE_TX)
	})

	it('should pass the isolation level to the transaction', async () => {
		const db = createFakeDb()
		registerDb(db as never)
		const service = new OrderService()

		await service.placeSerializable()

		expect(db.transaction.mock.calls[0][1]).toEqual({
			isolationLevel: 'serializable',
		})
	})

	it('should reuse the surrounding transaction instead of opening a new one', async () => {
		const db = createFakeDb()
		registerDb(db as never)
		const service = new OrderService()
		const outerTx = {
			outer: true,
		}

		const result = await transactionStorage.run(outerTx as never, () =>
			service.place(),
		)

		expect(db.transaction).not.toHaveBeenCalled()
		expect(result).toBe(outerTx)
	})
})
