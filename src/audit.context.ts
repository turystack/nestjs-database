/** Supplies the principal to stamp on audited writes. */
export type AuditActorReader = () => string | undefined

let reader: AuditActorReader | undefined

/**
 * Registers the source of the acting principal.
 *
 * Inverted like the logger's enrichment: this package knows nothing about
 * `@turystack/nestjs-context`, and the context package pushes the reader in. A
 * direct dependency would be a cycle, and an optional peer would have to be
 * imported asynchronously — which these synchronous write paths cannot await.
 */
export function registerAuditActor(next: AuditActorReader | undefined): void {
	reader = next
}

/** Id of the principal performing the operation in flight, when there is one. */
export function currentAuditActor(): string | undefined {
	return reader?.()
}

/** Column stamped on insert. */
export const CREATED_BY_COLUMN = 'createdBy'

/** Column stamped on update. */
export const UPDATED_BY_COLUMN = 'updatedBy'

/**
 * Stamps the acting principal on a write.
 *
 * Applied only when the table declares the column, so a schema without audit
 * fields is untouched. An explicit value always wins: the caller is more
 * specific than the ambient one.
 */
export function withAuditActor(
	data: Record<string, unknown>,
	columns: Record<string, unknown>,
	column: string,
): Record<string, unknown> {
	if (!columns[column] || data[column] !== undefined) {
		return data
	}

	const actor = currentAuditActor()

	if (!actor) {
		return data
	}

	return {
		...data,
		[column]: actor,
	}
}
