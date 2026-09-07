import path from 'node:path'

import { defineConfig } from 'vitest/config'

/**
 * End-to-end tests: no mocks, a real DynamoDB Local from this package's
 * `docker-compose.yml`.
 *
 * Kept in its own config so `pnpm test` neither needs Docker nor pays for it.
 */
export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
	test: {
		fileParallelism: false,
		include: ['**/*.e2e.test.ts'],
		root: './src',
		setupFiles: ['../vitest.setup.ts'],
		testTimeout: 30_000,
	},
})
