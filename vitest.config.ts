import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { defineConfig } from 'vitest/config';

const packageRoots = ['packages', 'packages/plugins', 'packages/pieces'];

function packageTestResolver() {
  return {
    name: 'package-test-resolver',
    resolveId(source: string, importer?: string) {
      if (!importer || source.startsWith('.') || source.startsWith('/') || source.startsWith('\0')) {
        return;
      }
      const parts = relative(process.cwd(), importer).split(sep);
      let root =
        parts[0] === 'test' && ['ui', 'unit'].includes(parts[1]) && parts[2]
          ? packageRoots.map((path) => join(path, parts[2])).find((path) =>
              existsSync(join(path, 'package.json')),
            )
          : undefined;
      let current = dirname(importer);
      while (!root && current.startsWith(process.cwd())) {
        if (existsSync(join(current, 'package.json'))) root = current;
        current = dirname(current);
      }
      if (!root) return;
      try {
        return createRequire(resolve(root, 'package.json')).resolve(source);
      } catch {
        return;
      }
    },
  };
}

export default defineConfig({
  plugins: [packageTestResolver()],
  test: {
    watch: false,
    retry: process.env.CI ? 2 : 0,
    projects: [
      {
        plugins: [packageTestResolver()],
        test: {
          name: 'unit',
          include: ['test/unit/**/*.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'test/unit/gateway/**'],
          environment: 'node',
        },
      },
      {
        esbuild: { jsx: 'automatic' },
        plugins: [packageTestResolver()],
        test: {
          name: 'ui',
          include: ['test/ui/**/*.spec.tsx'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          environment: 'jsdom',
          server: { deps: { inline: [/@payloadcms\/ui/] } },
          setupFiles: ['./packages/ui/src/vitest.setup.ts'],
        },
      },
      {
        test: {
          name: 'int',
          include: ['test/**/*int.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', 'test/gateway/**'],
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
        plugins: [packageTestResolver()],
        test: {
          name: 'gateway-unit',
          include: ['test/unit/gateway/**/*.spec.ts'],
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
            'test/gateway/live/matrix.e2e.spec.ts',
            'test/gateway/live/scenarios.e2e.spec.ts',
            'test/gateway/cacheLive.smoke.spec.ts',
          ],
          environment: 'node',
          fileParallelism: false,
          setupFiles: ['./test/gateway/live/loadEnv.ts'],
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: 'gateway-zen',
          include: ['test/gateway/crossRoute.e2e.spec.ts', 'test/gateway/zen*.e2e.spec.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 90000,
        },
      },
    ],
  },
});
