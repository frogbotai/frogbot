import eslint from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import playwright from 'eslint-plugin-playwright';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SPECS = ['**/*.spec.ts', '**/*.spec.tsx'];

const BROWSER_SPECS = 'test/browser/**/*.spec.ts';

const SLEEP = 'Wait for a condition, not a fixed time';

const TEST_BODY = `CallExpression:matches(${[
  '[callee.name=/^(it|test)$/]',
  '[callee.object.name=/^(it|test)$/][callee.property.name=/^(only|skip|fixme|fail|fails|concurrent|sequential)$/]',
  '[callee.callee.object.name=/^(it|test)$/][callee.callee.property.name=/^(each|for|skipIf|runIf)$/]',
].join(', ')}) > :function`;

const testSyntaxBans = [
  {
    selector:
      "NewExpression[callee.name='Promise'] > :function CallExpression[callee.name='setTimeout'][arguments.0.type='Identifier']",
    message: SLEEP,
  },
  {
    selector:
      "ImportDeclaration[source.value=/^(node:)?timers.promises$/] > ImportSpecifier[imported.name='setTimeout']",
    message: SLEEP,
  },
  { selector: "CallExpression[callee.name='sleep']", message: SLEEP },
  {
    selector: `${TEST_BODY} TryStatement`,
    message: 'No try in a test body; clean up in an after hook',
  },
];

const mockBans = [
  {
    selector: "CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock)$/]",
    message:
      'Integration, E2E and browser specs use the real modules; move module mocks to a unit test',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/*',
      '**/dist/*',
      '**/build/*',
      '**/.next/*',
      '**/*.tsbuildinfo',
      '**/frogbot-types.ts',
      '**/piece-types.ts',
      '**/importMap.js',
      '**/next-env.d.ts',
      'packages/frogbot/bin.js',
      '**/migrations/**',
      'test/.tmp/',
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/triple-slash-reference': 'off',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'no-console': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      curly: ['error', 'multi-line'],
    },
  },
  {
    files: SPECS,
    rules: {
      'no-restricted-syntax': ['error', ...testSyntaxBans],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.int.spec.ts', '**/*.e2e.spec.ts', BROWSER_SPECS],
    rules: { 'no-restricted-syntax': ['error', ...testSyntaxBans, ...mockBans] },
  },
  {
    files: SPECS,
    ignores: [BROWSER_SPECS],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect*', 'assertType'] }],
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      'vitest/valid-title': [
        'error',
        {
          mustNotMatch: [
            String.raw`^[Ss]hould\b|\b[Tt]icket ?\d+`,
            'Titles state the behavior in the present tense, with no "should" prefix or ticket number',
          ],
        },
      ],
      'vitest/no-disabled-tests': 'error',
      'vitest/no-conditional-in-test': 'error',
      'vitest/no-conditional-expect': 'off',
    },
  },
  {
    ...playwright.configs['flat/recommended'],
    files: [BROWSER_SPECS],
  },
  {
    files: [BROWSER_SPECS],
    rules: {
      'playwright/expect-expect': ['error', { assertFunctionPatterns: ['^expect'] }],
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-skipped-test': ['error', { allowConditional: true, disallowFixme: true }],
      'playwright/missing-playwright-await': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-conditional-expect': 'off',
      'playwright/prefer-locator': 'error',
    },
  },
  {
    files: ['**/bin/**', '**/cli/**', '**/scripts/**', '**/bin.js', '.opencode/plugins/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['templates/**', 'examples/**'],
    rules: { 'no-console': 'off' },
  },
);
