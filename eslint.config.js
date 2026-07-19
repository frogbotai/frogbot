import frogbotEslintConfig, { rootParserOptions } from '@frogbot/eslint-config'

/** @typedef {import('eslint').Linter.Config} Config */

export const defaultESLintIgnores = [
  '**/.temp',
  '**/.*', // ignore all dotfiles
  '**/.git',
  '**/tsconfig.tsbuildinfo',
  '**/README.md',
  '**/eslint.config.mjs',
  '**/eslint.config.js',
  '**/dist/',
  '**/build/',
  '**/node_modules/',
  '**/temp/',
  '**/*.e2e.spec.ts',
]

// Re-export so consuming packages can spread it and set only `tsconfigRootDir`
// (plus, where the build tsconfig excludes specs, an explicit `project`).
export { rootParserOptions }

/** @type {Config[]} */
export const rootEslintConfig = [
  ...frogbotEslintConfig,
  {
    ignores: [...defaultESLintIgnores, 'packages/eslint-config/**'],
  },
]

export default rootEslintConfig
