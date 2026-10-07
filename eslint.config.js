import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
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

const MISSPELLED_BRAND = 'Frog[b]ot|frog[B]ot';

const brandBans = [
  `Literal[value=/${MISSPELLED_BRAND}/]`,
  `TemplateElement[value.raw=/${MISSPELLED_BRAND}/]`,
].map((selector) => ({
  selector,
  message: 'Spell the brand FrogBot, or frogbot in lowercase names',
}));

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

const CAST_MESSAGE =
  'No `as never` or `as unknown as` in product code (DR-047). Type the value, or cross a seam with a checked converter: toPayloadRequest / attachRegisteredFrogBot, toPayloadConfig / toPayloadFields / wrapPayloadPlugin (frogbot/src/seams), or an adapter guard such as assertDrizzleAdapter (frogbot/src/database/guards.ts).';

const castBans = [
  { selector: "TSAsExpression[typeAnnotation.type='TSNeverKeyword']", message: CAST_MESSAGE },
  {
    selector:
      "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
    message: CAST_MESSAGE,
  },
];

// The checked converters, the only product files that may cast across a seam. Each cast there
// sits beside a type-level check that fails tsc when FrogBot's and Payload's types drift.
const CAST_CONVERTERS = [
  'packages/frogbot/src/seams/config.ts',
  'packages/frogbot/src/seams/request.ts',
  'packages/richtext-lexical/src/utilities/seams.ts',
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

function topLevel(...types) {
  const exported = types.map((type) => `[declaration.type="${type}"]`).join(', ');

  return {
    selector: `Program > :matches(${types.join(', ')}, ExportNamedDeclaration:matches(${exported}))`,
  };
}

const DECLARATION = topLevel(
  'ClassDeclaration',
  'FunctionDeclaration',
  'TSDeclareFunction',
  'TSEnumDeclaration',
  'TSInterfaceDeclaration',
  'TSModuleDeclaration',
  'TSTypeAliasDeclaration',
);

const OVERLOAD = topLevel('TSDeclareFunction');

const FUNCTION = topLevel('FunctionDeclaration', 'TSDeclareFunction');

const PARAGRAPH = ['for', 'while', 'do', 'multiline-expression'];

const blankLines = [
  'error',
  { blankLine: 'always', prev: '*', next: 'return' },
  { blankLine: 'always', prev: ['multiline-const', 'multiline-let'], next: '*' },
  { blankLine: 'always', prev: '*', next: PARAGRAPH },
  { blankLine: 'always', prev: PARAGRAPH, next: '*' },
  { blankLine: 'always', prev: 'block-like', next: '*' },
  { blankLine: 'always', prev: '*', next: DECLARATION },
  { blankLine: 'always', prev: DECLARATION, next: '*' },
  { blankLine: 'any', prev: OVERLOAD, next: FUNCTION },
];

// A statement that starts with `expect`, as vitest/padding-around-expect-groups groups them, so a
// multiline assertion stays in its group.
function startsWith(name, depth = 6) {
  let paths = [''];
  const starts = [];

  for (let step = 0; step < depth; step++) {
    paths = paths.flatMap((chain) => [`${chain}.callee`, `${chain}.object`]);
    starts.push(...paths);
  }

  return starts.flatMap((chain) =>
    ['expression', 'expression.argument'].map((base) => `[${base}${chain}.name=${name}]`),
  );
}

const EXPECT = {
  selector: `ExpressionStatement:matches(${startsWith('/^expect(TypeOf)?$/').join(', ')})`,
};

const specBlankLines = [...blankLines, { blankLine: 'any', prev: EXPECT, next: EXPECT }];

export default tseslint.config(
  { ignores: IGNORES },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { '@stylistic': stylistic, 'simple-import-sort': simpleImportSort },
    rules: {
      '@stylistic/padding-line-between-statements': blankLines,
      '@stylistic/lines-between-class-members': [
        'error',
        'always',
        { exceptAfterSingleLine: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/triple-slash-reference': 'off',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 10,
        },
      ],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: null, custom: { regex: MISSPELLED_BRAND, match: false } },
      ],
      'no-restricted-syntax': ['error', ...brandBans],
      'no-console': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      curly: ['error', 'multi-line'],
    },
  },
  {
    files: SPECS,
    rules: {
      '@stylistic/padding-line-between-statements': specBlankLines,
      'no-restricted-syntax': ['error', ...brandBans, ...testSyntaxBans],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.int.spec.ts', '**/*.e2e.spec.ts', BROWSER_SPECS],
    rules: { 'no-restricted-syntax': ['error', ...brandBans, ...testSyntaxBans, ...mockBans] },
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
      'vitest/padding-around-expect-groups': 'error',
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
    files: ['packages/**/src/**/*.{ts,tsx}'],
    ignores: [...SPECS, '**/vitest.setup.ts', ...CAST_CONVERTERS],
    rules: { 'no-restricted-syntax': ['error', ...brandBans, ...castBans] },
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
