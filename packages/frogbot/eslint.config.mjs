import { rootEslintConfig, rootParserOptions } from '../../eslint.config.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @typedef {import('eslint').Linter.Config} Config */

/**
 * FrogBot core — flat ESLint config (ESLint 9 + typescript-eslint).
 *
 * The build tsconfig.json excludes spec files, so projectService cannot cover
 * them. Use an explicit lint tsconfig (`tsconfig.eslint.json`) that includes
 * everything.
 *
 * @type {Config[]}
 */
export const index = [
  {
    ignores: ['dist/', 'node_modules/', 'bin.js'],
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
  },
]

export default index
