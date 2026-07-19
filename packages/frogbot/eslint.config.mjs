import { createRootConfig } from '@frogbot/eslint-config-flat'

/**
 * FrogBot core — flat ESLint config (ESLint 9 + typescript-eslint).
 */
export default [
  {
    ignores: ['dist/', 'node_modules/'],
  },
  ...createRootConfig({
    tsconfigRootDir: import.meta.dirname,
    // The build tsconfig.json excludes spec files, so projectService cannot
    // cover them. Use an explicit lint tsconfig that includes everything.
    projectService: false,
    project: './tsconfig.eslint.json',
  }),
]
