/** DI token for the DatabaseService instance. */
export const DATABASE_SERVICE = Symbol('DATABASE_SERVICE')

/** DI token for the active {@link IDatabaseAdapter} implementation. */
export const DATABASE_ADAPTER = Symbol('DATABASE_ADAPTER')

/** DI token for the resolved {@link DatabaseModuleOptions}. */
export const DATABASE_MODULE_OPTIONS = Symbol('DATABASE_MODULE_OPTIONS')
