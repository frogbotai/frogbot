import eslint from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import playwright from 'eslint-plugin-playwright';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import frogbot from './scripts/eslint-plugin/index.mjs';
import { reactA11yRules } from './scripts/lib/eslint-react-a11y.mjs';

const IGNORES = [
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
];

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

const UI_SOURCE = 'packages/ui/src/**/*.{ts,tsx}';

const UI_LIBRARIES = [
  {
    regex: '^(?:lucide-react|react-icons)(?:/|$)',
    message: 'Use the icon factories in packages/ui/src/icons.',
  },
  {
    regex: '^(?:clsx|classnames|tailwind-merge|class-variance-authority)(?:/|$)',
    message: 'Join class names with plain string concatenation.',
  },
];

const PAYLOAD_UI_MESSAGE =
  'Only packages/ui/src/exports/{client,rsc,shared}/index.ts import @payloadcms/ui, one entry each.';

const PAYLOAD_UI_ENTRIES = {
  'packages/ui/src/exports/client/index.ts': 'ui',
  'packages/ui/src/exports/rsc/index.ts': 'ui/rsc',
  'packages/ui/src/exports/shared/index.ts': 'ui/shared',
};

function uiImports(...patterns) {
  return ['error', { patterns: [...UI_LIBRARIES, ...patterns] }];
}

export default tseslint.config(
  { ignores: IGNORES },
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
  {
    plugins: { frogbot },
    rules: {
      'frogbot/no-imports-from-exports-dir': 'error',
      'frogbot/no-imports-from-self': 'error',
    },
  },
  {
    files: ['packages/{ui,next}/**'],
    rules: { 'frogbot/client-imports': 'error' },
  },
  {
    files: [UI_SOURCE],
    rules: {
      'no-restricted-imports': uiImports({ regex: '^@payloadcms/', message: PAYLOAD_UI_MESSAGE }),
    },
  },
  {
    files: ['packages/ui/src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': uiImports(
        { regex: '^@payloadcms/', message: PAYLOAD_UI_MESSAGE },
        {
          regex: '(?:^|/)(?:chat|admin)(?:[/.-]|$)|^@frogbotai/next(?:/|$)',
          message: 'Components must not import chat or admin code.',
        },
      ),
    },
  },
  ...Object.entries(PAYLOAD_UI_ENTRIES).map(([file, entry]) => ({
    files: [file],
    rules: {
      'no-restricted-imports': uiImports({
        regex: `^@payloadcms/(?!${entry}$)`,
        message: PAYLOAD_UI_MESSAGE,
      }),
    },
  })),
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      ...reactA11yRules,
      'jsx-a11y/anchor-is-valid': 'off',
      'jsx-a11y/control-has-associated-label': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
    },
  },
);
