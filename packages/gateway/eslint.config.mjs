import { rootEslintConfig, rootParserOptions } from '../../eslint.config.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @typedef {import('eslint').Linter.Config} Config */

/**
 * @frogbotai/gateway — flat ESLint config (ESLint 9 + typescript-eslint).
 *
 * Lints the package `src` as well as the root-level gateway test suite at
 * `test/gateway/**`. Because those tests live outside the package directory,
 * this config is invoked from the repo root (`eslint --config <this> \
 * packages/gateway/src test/gateway`) so both paths share a common base path.
 *
 * The build tsconfig.json excludes specs and covers only `src`, so an explicit
 * lint tsconfig (`tsconfig.eslint.json`) is used that also covers the
 * cross-package test suite.
 *
 * @type {Config[]}
 */
export const index = [
  {
    ignores: [
      'packages/gateway/dist/',
      '**/node_modules/',
      '**/*.e2e.spec.ts',
      // Root e2e entrypoint that doesn't follow the *.e2e.spec.ts pattern but
      // is registered under the `gateway-e2e` vitest project.
      'test/gateway/e2e.spec.ts',
    ],
  },
  ...rootEslintConfig,
  {
    languageOptions: {
      parserOptions: {
        ...rootParserOptions,
        projectService: false,
        project: join(__dirname, 'tsconfig.eslint.json'),
        tsconfigRootDir: __dirname,
      },
    },
    files: [
      'packages/gateway/src/**/*.ts',
      'test/gateway/**/*.ts',
      'test/__helpers/gateway/**/*.ts',
    ],
  },
]

export default index
