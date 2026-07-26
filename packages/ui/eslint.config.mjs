import { rootEslintConfig, rootParserOptions } from '../../eslint.config.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default [
  {
    ignores: ['dist/', 'node_modules/'],
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
