import { rootEslintConfig, rootParserOptions } from '../../eslint.config.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @typedef {import('eslint').Linter.Config} Config */

/** @type {Config[]} */
export const index = [
  {
    ignores: ['dist/', 'node_modules/', 'bin.js', 'scripts/'],
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
    rules: {
      'no-console': 'off',
    },
  },
]

export default index
