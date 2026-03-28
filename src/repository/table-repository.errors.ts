export class RecordNotFoundError extends Error {
	readonly code = 'record_not_found'

	constructor(table: string) {
		super(`[TableRepository] record not found in "${table}"`)
		this.name = 'RecordNotFoundError'
	}
}

export class RecordNotCreatedError extends Error {
	readonly code = 'record_not_created'

	constructor(table: string) {
		super(`[TableRepository] insert returned no rows for "${table}"`)
		this.name = 'RecordNotCreatedError'
	}
}
