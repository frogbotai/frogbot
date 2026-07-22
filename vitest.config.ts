import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    watch: false,
    passWithNoTests: true,
    retry: process.env.CI ? 2 : 0,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/**/*.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'int',
          include: ['test/**/*int.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          environment: 'node',
          fileParallelism: false,
          hookTimeout: 90000,
          testTimeout: 90000,
          retry: process.env.CI ? 2 : 0,
          setupFiles: ['./test/vitest.setup.ts'],
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.e2e.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          environment: 'node',
          fileParallelism: false,
          hookTimeout: 240000,
          testTimeout: 120000,
        },
      },
      {
        test: {
          name: 'gateway-unit',
          include: ['packages/gateway/src/**/*.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'gateway-integration',
          include: ['test/gateway/**/*.int.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          environment: 'node',
          fileParallelism: false,
          hookTimeout: 90000,
          testTimeout: 90000,
          retry: process.env.CI ? 2 : 0,
          setupFiles: ['./test/vitest.setup.ts'],
        },
      },
      {
        test: {
          name: 'gateway-golden',
          include: ['test/gateway/golden.spec.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'gateway-e2e',
          include: [
            'test/gateway/e2e.spec.ts',
            'test/gateway/crossRoute.e2e.spec.ts',
            'test/gateway/live/matrix.e2e.spec.ts',
            'test/gateway/live/scenarios.e2e.spec.ts',
          ],
          environment: 'node',
          fileParallelism: false,
          setupFiles: ['./test/gateway/live/loadEnv.ts'],
          testTimeout: 30000,
        },
      },
    ],
  },
})
