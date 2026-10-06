import eslint from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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
      '**/*.e2e.spec.ts',
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
    files: ['**/*.spec.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect*', 'assertType'] }],
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      'vitest/no-conditional-expect': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
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
