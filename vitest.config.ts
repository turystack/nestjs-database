import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
	test: {
		// The e2e suite needs Docker and has its own config; `pnpm test` must not
		// pick it up and fail on a machine that never started a container.
		exclude: ['**/*.e2e.test.ts'],
		coverage: {
			exclude: ['**/*.test.ts', '**/index.ts'],
			include: ['**/*.ts'],
			reportsDirectory: '../coverage',
			thresholds: {
				branches: 90,
				functions: 90,
				lines: 90,
				statements: 90,
			},
		},
		include: ['**/*.test.ts'],
		root: './src',
		setupFiles: ['../vitest.setup.ts'],
	},
})
