import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import globals from 'globals'
import typescriptParser from '@typescript-eslint/parser'
import vitest from '@vitest/eslint-plugin'
import { deepMerge } from './deepMerge.js'

/**
 * Base (non-type-aware) rules borrowed from Payload's flat config.
 *
 * Correctness-relevant rules from Payload's `baseRules` are included. The
 * sorting plugins (perfectionist/regexp) Payload layers into `baseExtends`
 * are intentionally omitted — they enforce import/object/type ordering, which
 * is style, not correctness, and produces large diffs on a codebase that was
 * never type-linted before.
 */
export const baseRules = {
  // This rule makes no sense when overriding class methods (Payload note).
  'class-methods-use-this': 'off',
  curly: ['warn', 'multi-line'],
  'no-restricted-syntax': [
    'warn',
    {
      selector: ':matches(ForStatement, ForInStatement, ForOfStatement, WhileStatement, DoWhileStatement)[body.type!="BlockStatement"]',
      message: 'Use braces around loop bodies.',
    },
  ],
  'arrow-body-style': 0,
  'no-restricted-exports': ['warn', { restrictDefaultExports: { direct: true } }],
  'no-console': 'warn',
  'no-sparse-arrays': 'off',
  'no-underscore-dangle': 'off',
  'no-use-before-define': 'off',
  'object-shorthand': 'warn',
  'no-useless-escape': 'warn',
}

/**
 * Type-aware TypeScript rules. Warn-first, mirroring Payload's actual choice.
 */
export const typescriptRules = {
  '@typescript-eslint/no-use-before-define': 'off',

  // Type-aware any family: fully OFF.
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',

  // Warn-first.
  '@typescript-eslint/unbound-method': 'warn',
  '@typescript-eslint/consistent-type-imports': 'warn',
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/ban-ts-comment': 'warn',
  '@typescript-eslint/no-base-to-string': 'warn',
  '@typescript-eslint/restrict-template-expressions': 'warn',
  '@typescript-eslint/no-redundant-type-constituents': 'warn',
  '@typescript-eslint/no-unnecessary-type-constraint': 'warn',
  '@typescript-eslint/no-empty-object-type': 'warn',

  // The @typescript-eslint variant understands type-position params,
  // exported enums, and TS method-overload duplicate names — which fixes
  // the base-rule false positives.
  '@typescript-eslint/no-unused-vars': [
    'warn',
    {
      vars: 'all',
      args: 'after-used',
      ignoreRestSiblings: false,
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      destructuredArrayIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^(_|ignore)',
    },
  ],

  // Kept as error — this is a real correctness guard.
  '@typescript-eslint/no-misused-promises': [
    'error',
    {
      // Don't want something like <button onClick={someAsyncFunction}> to error.
      checksVoidReturn: {
        attributes: false,
        arguments: false,
      },
    },
  ],
}

/** @typedef {import('eslint').Linter.Config} Config */

/** @type {FlatConfig} */
const baseExtends = js.configs.recommended

/**
 * Build the shared flat config array.
 *
 * @param {Object} [options]
 * @param {string} [options.tsconfigRootDir] - Root dir for tsconfig discovery.
 *   Each consuming package should pass `import.meta.dirname`.
 * @param {string[]} [options.files] - Override the TS block `files` globs.
 *   Defaults to `['**\/*.ts']`. Useful for packages that lint files outside their own dir.
 * @param {boolean} [options.projectService] - Use typescript-eslint's projectService
 *   (auto-discovers the nearest tsconfig.json). Defaults to `true`. Set to `false`
 *   and pass `project` when the build tsconfig excludes files that must be linted
 *   (e.g. spec files), which projectService cannot cover.
 * @param {string | string[]} [options.project] - Explicit tsconfig path(s) for the
 *   parser (classic `parserOptions.project`). Used when `projectService` is `false`.
 * @returns {Config[]}
 */
export const createRootConfig = ({
  tsconfigRootDir,
  files = ['**/*.ts'],
  projectService = true,
  project,
} = {}) => [
  {
    name: 'Ignores',
    // Tooling / config files are not type-checked or linted here.
    ignores: ['**/*.mjs', '**/*.cjs', '**/*.js', '**/*.jsx'],
  },
  {
    name: 'Settings',
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    name: 'TypeScript',
    // recommendedTypeChecked has 3 entries.
    ...deepMerge(
      baseExtends,
      tseslint.configs.recommendedTypeChecked[0],
      tseslint.configs.recommendedTypeChecked[1],
      tseslint.configs.recommendedTypeChecked[2],
      eslintConfigPrettier,
      {
        languageOptions: {
          parserOptions: {
            ...(project ? { project, projectService: false } : { projectService }),
            tsconfigRootDir,
          },
          ecmaVersion: 'latest',
          sourceType: 'module',
          globals: {
            ...globals.node,
          },
          parser: typescriptParser,
        },
        rules: {
          ...baseRules,
          ...typescriptRules,
        },
      },
    ),
    files,
  },
  {
    name: 'Unit and Integration Tests',
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      // Recognize custom assertion helpers (e.g. `expectForwardedOr400`) so
      // expect-expect still guards genuinely assertion-free tests without
      // false-positiving on wrapper matchers.
      'vitest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expect*', 'assert*'] },
      ],
    },
    files: ['**/*.spec.ts'],
    ignores: ['**/*.e2e.spec.ts'],
  },
]

/**
 * Default export mirrors Payload's `rootEslintConfig` export shape.
 * Note: consumers should prefer `createRootConfig({ tsconfigRootDir })` so
 * projectService resolves each package's tsconfig. This default uses this
 * package's own dir as the root and is provided for parity/spread use.
 *
 * @type {Config[]}
 */
export const rootEslintConfig = createRootConfig({ tsconfigRootDir: import.meta.dirname })

export default rootEslintConfig
