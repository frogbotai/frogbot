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
      selector:
        ':matches(ForStatement, ForInStatement, ForOfStatement, WhileStatement, DoWhileStatement)[body.type!="BlockStatement"]',
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

/**
 * Shared parser options. Mirrors Payload's `rootParserOptions` export so
 * consuming packages can spread it and set only `tsconfigRootDir` (and, where
 * the build tsconfig excludes spec files, an explicit `project`).
 *
 * Note on `projectService` vs `project`: Payload can use `projectService: true`
 * everywhere because its build tsconfig covers all files. FrogBot's build
 * tsconfigs exclude spec files, so packages that lint specs pass an explicit
 * `project` (their `tsconfig.eslint.json`) and set `projectService: false`.
 */
export const rootParserOptions = {
  sourceType: 'module',
  ecmaVersion: 'latest',
  projectService: true,
}

/** @type {FlatConfig} */
const baseExtends = js.configs.recommended

/**
 * The shared flat config array. Mirrors Payload's `rootEslintConfig` export
 * shape: a static array consumed via spread, with parser options layered in by
 * each package's own `eslint.config.mjs`.
 *
 * @type {Config[]}
 */
export const rootEslintConfig = [
  {
    name: 'Settings',
    languageOptions: {
      parserOptions: {
        ...rootParserOptions,
        tsconfigRootDir: import.meta.dirname,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
      parser: typescriptParser,
    },
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
        rules: {
          ...baseRules,
          ...typescriptRules,
        },
      },
    ),
    files: ['**/*.ts'],
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

export default rootEslintConfig
