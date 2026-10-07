import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { eslintResult, fullOnlyChecks } from '../../../scripts/check.mjs';
import {
  exceptions,
  typedLintCommand,
  typedLintLines,
} from '../../../scripts/check-typed-lint.mjs';
import { BASE_GATES } from '../../../scripts/ticket.mjs';

const root = path.resolve(import.meta.dirname, '../../..');

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const eslintBin = path.join(root, 'node_modules', '.bin', 'eslint');

const oxlintBin = path.join(root, 'node_modules', '.bin', 'oxlint');

const temporary: string[] = [];

type Message = { ruleId: string | null; severity: number; message: string };

function lintScriptArgs(script: string) {
  const [command, ...args] = script.split(' ');

  expect(command).toBe('eslint');

  return args.filter(
    (arg, index) =>
      arg !== '.' && !arg.startsWith('--cache') && args[index - 1] !== '--cache-location',
  );
}

function lint(args: string[], input?: string) {
  const result = spawnSync(eslintBin, [...lintScriptArgs(pkg.scripts.lint), ...args], {
    cwd: root,
    encoding: 'utf8',
    input,
  });

  return { code: result.status, stdout: result.stdout, output: result.stdout + result.stderr };
}

function lintText(filename: string, code: string, args: string[] = []) {
  return lint([...args, '--stdin', '--stdin-filename', filename], code);
}

function messages(stdout: string): Message[] {
  return JSON.parse(stdout).flatMap(({ messages }: { messages: Message[] }) => messages);
}

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('lint entry points', () => {
  it.each([
    ['lint', pkg.scripts.lint],
    ['lint:fix', pkg.scripts['lint:fix']],
    ['lint-staged', pkg['lint-staged']['*.{ts,tsx,js,mjs}'][0]],
  ])('%s fails on any warning and never hides warnings', (_name, script) => {
    expect(script).toContain('--max-warnings=0');
    expect(script).not.toContain('--quiet');
  });
});

describe('pnpm lint', () => {
  it('fails on the preset warning from the hook order added in 059a0ded', () => {
    const result = lintText(
      'test/browser/chatErrors.browser.spec.ts',
      "import { test } from '@playwright/test';\n\n" +
        'test.afterAll(async () => {\n' +
        '  await model.close();\n' +
        '});\n\n' +
        'test.beforeEach(async () => {\n' +
        '  model.reset();\n' +
        '});\n',
    );

    expect(result.code).toBe(1);
    expect(result.output).toContain('playwright/prefer-hooks-in-order');
    expect(result.output).toContain('ESLint found too many warnings (maximum: 0)');
  });

  it('fails on the unused disable in packages/frogbot/src/config/sanitize.spec.ts at 09fb3fe2', () => {
    const result = lintText(
      'packages/frogbot/src/config/sanitize.spec.ts',
      "import { expect, it } from 'vitest';\n\n" +
        "it('drops the FrogBot plugins key from the payload config', () => {\n" +
        '  const payloadConfig: unknown = {};\n\n' +
        '  expect((payloadConfig as any).plugins).toBeUndefined(); // eslint-disable-line @typescript-eslint/no-explicit-any\n' +
        '});\n',
      ['--format', 'json'],
    );

    expect(result.code).toBe(1);

    expect(messages(result.stdout)).toEqual([
      expect.objectContaining({
        ruleId: null,
        severity: 2,
        message: expect.stringContaining('Unused eslint-disable directive'),
      }),
    ]);
  });

  it.each([
    [
      '@typescript-eslint/no-explicit-any',
      'any cast removed in 2cc7bd89',
      'packages/frogbot/src/config/sanitize.ts',
      'declare const config: object;\nexport const onInit = (config as any).onInit;\n',
    ],
    [
      '@typescript-eslint/consistent-type-imports',
      'import() type from bcbd35c7',
      'packages/frogbot/src/config/sanitize.ts',
      "export let otelModule: typeof import('@ai-sdk/otel') | undefined;\n",
    ],
    [
      'no-console',
      'gateway hook log at 3fe6c693',
      'packages/gateway/src/hooks.ts',
      "console.error('[gateway] hook error');\n",
    ],
    [
      'curly',
      'braceless return in scripts/check-generated.mjs at 3fe6c693',
      'scripts/check-generated.mjs',
      'export function check(args) {\n' +
        '  if (!args)\n' +
        "    return { status: 'error', message: 'no generate:types script' };\n\n" +
        '  return args;\n' +
        '}\n',
    ],
    [
      'simple-import-sort/imports',
      'import order in packages/frogbot/src/config/sanitize.ts at 3fe6c693',
      'packages/frogbot/src/config/sanitize.ts',
      "import { assertRichTextEditor } from '../fields/config/assertRichTextEditor.js';\n" +
        "import { sanitizeAIFields } from '../fields/baseFields/ai/sanitize.js';\n\n" +
        'export { assertRichTextEditor, sanitizeAIFields };\n',
    ],
  ])('reports %s as an error: %s', (rule, _source, filename, code) => {
    const result = lintText(filename, code, ['--format', 'json']);
    const found = messages(result.stdout).filter(({ ruleId }) => ruleId === rule);

    expect(found.length).toBeGreaterThan(0);
    expect(found.every(({ severity }) => severity === 2)).toBe(true);
  });

  it('fails and pnpm check prints the prune command when the curly fixed since 3fe6c693 stays suppressed', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'frogbot-lint-'));
    const suppressions = path.join(dir, 'eslint-suppressions.json');

    temporary.push(dir);

    writeFileSync(
      suppressions,
      JSON.stringify({ 'scripts/check-generated.mjs': { curly: { count: 1 } } }),
    );

    const result = lint([
      '--format',
      'json',
      '--suppressions-location',
      suppressions,
      'scripts/check-generated.mjs',
    ]);

    expect(result.code).toBe(2);

    expect(eslintResult(result)).toMatchObject({
      ok: false,
      groups: [[expect.stringContaining('pnpm lint --prune-suppressions')]],
    });
  });
});

describe('product-code cast ban (DR-047)', () => {
  const code =
    'declare const value: { id: string };\n' +
    'export const hidden = value as never;\n' +
    'export const forced = value as unknown as number;\n' +
    'export const narrowed = value as { id: string };\n';

  function casts(filename: string) {
    const dir = mkdtempSync(path.join(tmpdir(), 'frogbot-lint-'));
    const suppressions = path.join(dir, 'eslint-suppressions.json');

    temporary.push(dir);
    writeFileSync(suppressions, '{}');

    return messages(
      lintText(filename, code, ['--format', 'json', '--suppressions-location', suppressions])
        .stdout,
    )
      .filter(({ message }) => message.includes('DR-047'))
      .map(({ ruleId, severity }) => `${ruleId} ${severity}`);
  }

  it('reports `as never` and `as unknown as` in package source, not a single checked `as`', () => {
    expect(casts('packages/frogbot/src/chat/example.ts')).toEqual([
      'no-restricted-syntax 2',
      'no-restricted-syntax 2',
    ]);
  });

  it.each([
    'packages/frogbot/src/chat/example.spec.ts',
    'packages/frogbot/src/seams/config.ts',
    'packages/frogbot/src/seams/request.ts',
    'packages/richtext-lexical/src/utilities/seams.ts',
  ])('allows them in %s', (filename) => {
    expect(casts(filename)).toEqual([]);
  });
});

describe('brand spelling (DR-056)', () => {
  // Split so this file does not trip the rule it tests.
  const misspellings = ['Frog' + 'bot', 'frog' + 'Bot'];

  function brand(filename: string, code: string) {
    const dir = mkdtempSync(path.join(tmpdir(), 'frogbot-lint-'));
    const suppressions = path.join(dir, 'eslint-suppressions.json');

    temporary.push(dir);
    writeFileSync(suppressions, '{}');

    return messages(
      lintText(filename, code, ['--format', 'json', '--suppressions-location', suppressions])
        .stdout,
    )
      .filter(
        ({ ruleId, message }) =>
          ruleId === '@typescript-eslint/naming-convention' || message.includes('Spell the brand'),
      )
      .map(({ ruleId }) => ruleId);
  }

  it.each(
    misspellings.flatMap((name) =>
      [
        'packages/frogbot/src/chat/example.ts',
        'test/chat/example.int.spec.ts',
        'test/unit/example.spec.ts',
        'scripts/example.mjs',
      ].map((filename) => [name, filename]),
    ),
  )('reports %s in an identifier, a string and a template in %s', (name, filename) => {
    expect(
      brand(
        filename,
        `export const get${name}Name = () => '${name}';\n` +
          `export const label = (id) => \`${name} \${id}\`;\n`,
      ),
    ).toEqual([
      '@typescript-eslint/naming-convention',
      'no-restricted-syntax',
      'no-restricted-syntax',
    ]);
  });

  it('allows FrogBot and lowercase frogbot', () => {
    expect(
      brand(
        'packages/frogbot/src/chat/example.ts',
        "export const getFrogBot = () => 'FrogBot';\n" +
          'export const frogbotSlug = `frogbot-chat-${getFrogBot()}`;\n',
      ),
    ).toEqual([]);
  });
});

describe('blank lines', () => {
  function fixed(filename: string, code: string) {
    const dir = mkdtempSync(path.join(tmpdir(), 'frogbot-lint-'));
    const suppressions = path.join(dir, 'eslint-suppressions.json');

    temporary.push(dir);
    writeFileSync(suppressions, '{}');

    const [result] = JSON.parse(
      lintText(filename, code, [
        '--fix-dry-run',
        '--format',
        'json',
        '--suppressions-location',
        suppressions,
      ]).stdout,
    );

    return result.output ?? code;
  }

  it('separates returns, multiline declarations, loops, blocks, top-level declarations and methods', () => {
    const code = [
      'type Label = string;',
      'type Count = number;',
      'export function echo(value: Label): Label;',
      'export function echo(value: Count): Count;',
      'export function echo(value: Label | Count) {',
      '  return value;',
      '}',
      'export class Counter {',
      '  count = 0;',
      '  step = 1;',
      '  first() {',
      '    return this.count;',
      '  }',
      '  next() {',
      '    return this.count + this.step;',
      '  }',
      '}',
      'export function collect(items: Label[]) {',
      '  const seen = new Set<Label>();',
      '  const total = items.length;',
      '  const labels = items.map(',
      '    (item) => item.toUpperCase(),',
      '  );',
      '  items.forEach((item) => {',
      '    seen.add(item);',
      '  });',
      '  if (total > 1) {',
      '    seen.clear();',
      '  }',
      '  for (const label of labels) seen.add(label);',
      '  return seen;',
      '}',
      '',
    ].join('\n');

    expect(fixed('packages/frogbot/src/chat/example.ts', code)).toBe(
      [
        'type Label = string;',
        '',
        'type Count = number;',
        '',
        'export function echo(value: Label): Label;',
        'export function echo(value: Count): Count;',
        'export function echo(value: Label | Count) {',
        '  return value;',
        '}',
        '',
        'export class Counter {',
        '  count = 0;',
        '  step = 1;',
        '  first() {',
        '    return this.count;',
        '  }',
        '',
        '  next() {',
        '    return this.count + this.step;',
        '  }',
        '}',
        '',
        'export function collect(items: Label[]) {',
        '  const seen = new Set<Label>();',
        '  const total = items.length;',
        '  const labels = items.map(',
        '    (item) => item.toUpperCase(),',
        '  );',
        '',
        '  items.forEach((item) => {',
        '    seen.add(item);',
        '  });',
        '',
        '  if (total > 1) {',
        '    seen.clear();',
        '  }',
        '',
        '  for (const label of labels) seen.add(label);',
        '',
        '  return seen;',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('separates setup, execution and assertion groups in a spec, keeping a multiline expect in its group', () => {
    const code = [
      "import { expect, it } from 'vitest';",
      '',
      "it('doubles', async () => {",
      '  const sum = 1 + 1;',
      '  expect(sum).toBe(2);',
      '  expect({ sum }).toEqual({',
      '    sum: 2,',
      '  });',
      '  await expect(Promise.resolve(sum)).resolves.not.toBe(3);',
      '  const product = sum * 2;',
      '  expect(product).toBe(4);',
      '});',
      '',
    ].join('\n');

    expect(fixed('test/unit/example.spec.ts', code)).toBe(
      [
        "import { expect, it } from 'vitest';",
        '',
        "it('doubles', async () => {",
        '  const sum = 1 + 1;',
        '',
        '  expect(sum).toBe(2);',
        '  expect({ sum }).toEqual({',
        '    sum: 2,',
        '  });',
        '  await expect(Promise.resolve(sum)).resolves.not.toBe(3);',
        '',
        '  const product = sum * 2;',
        '',
        '  expect(product).toBe(4);',
        '});',
        '',
      ].join('\n'),
    );
  });
});

describe('test lint', () => {
  function lintSpec(filename: string, code: string) {
    const dir = mkdtempSync(path.join(tmpdir(), 'frogbot-lint-'));
    const suppressions = path.join(dir, 'eslint-suppressions.json');

    temporary.push(dir);
    writeFileSync(suppressions, '{}');

    return messages(
      lintText(filename, code, ['--format', 'json', '--suppressions-location', suppressions])
        .stdout,
    );
  }

  function reported(filename: string, code: string) {
    return lintSpec(filename, code).map(({ ruleId, severity, message }) =>
      ruleId === 'no-restricted-syntax' ? `${ruleId}: ${message}` : `${ruleId} ${severity}`,
    );
  }

  it('lints E2E specs and allows the env-gated describe.skipIf from 8cbaf1a4', () => {
    expect(
      lintSpec(
        'test/e2e/frogbotRun.e2e.spec.ts',
        "import { describe, expect, it } from 'vitest';\n\n" +
          'declare function run(project: string, args: string[]): Promise<{ code: number }>;\n\n' +
          "describe.skipIf(!process.env.RUN_E2E)('frogbot run', () => {\n" +
          "  it('loads env before resolving the config alias', async () => {\n" +
          "    const result = await run('project', ['src/seed.ts']);\n\n" +
          '    expect(result.code).toBe(0);\n' +
          '  });\n' +
          '});\n',
      ),
    ).toEqual([]);
  });

  it('applies vitest rules to .spec.tsx files, as on the assertion pair from 2b681ff4', () => {
    expect(
      reported(
        'test/ui/ui/chat/question-tool-render.spec.tsx',
        "import { expect, it, vi } from 'vitest';\n\n" +
          "it('submits the answer', () => {\n" +
          '  const addToolOutput = vi.fn();\n\n' +
          '  expect(addToolOutput).toHaveBeenCalledOnce();\n' +
          "  expect(addToolOutput).toHaveBeenCalledWith({ answers: [{ header: 'Target', selected: ['Staging'] }] });\n" +
          '});\n',
      ),
    ).toEqual(['vitest/prefer-called-exactly-once-with 2']);
  });

  it('requires a reason on @ts-expect-error, as on the off-type MCP tools in test/mcp-tools/int.spec.ts', () => {
    const code = (comment: string) =>
      "import { expect, it } from 'vitest';\n\n" +
      'declare function defineTool(tool: { slug: string }): { slug: string };\n\n' +
      "it('rejects a tool without a slug', () => {\n" +
      `  ${comment}\n` +
      '  expect(() => defineTool({})).toThrow(/slug/);\n' +
      '});\n';

    const filename = 'test/mcp-tools/int.spec.ts';

    expect(reported(filename, code('// @ts-expect-error'))).toEqual([
      '@typescript-eslint/ban-ts-comment 2',
    ]);

    expect(
      reported(
        filename,
        code('// @ts-expect-error a tool without a slug must be rejected at runtime'),
      ),
    ).toEqual([]);
  });

  it('gives browser specs the Playwright rules instead of the vitest rules', async () => {
    const { ESLint } = await import('eslint');
    const config = await new ESLint({ cwd: root }).calculateConfigForFile(
      'test/browser/navShell.browser.spec.ts',
    );

    const rules = Object.keys(config.rules);

    expect(rules.filter((rule) => rule.startsWith('vitest/'))).toEqual([]);

    expect(rules).toEqual(
      expect.arrayContaining([
        'playwright/prefer-web-first-assertions',
        'playwright/no-wait-for-timeout',
        'playwright/no-skipped-test',
        'playwright/missing-playwright-await',
      ]),
    );
  });

  it.each([
    [
      'playwright/prefer-web-first-assertions',
      'textContent assertion from ec3063ed',
      'test/browser/chatAssets.browser.spec.ts',
      "test('opens the text asset', async ({ page }) => {\n" +
        "  const viewer = page.locator('.fb-asset-viewer');\n\n" +
        "  expect(await viewer.locator('pre').textContent()).toBe('hello');\n" +
        '});\n',
    ],
    [
      'playwright/no-skipped-test',
      'test.fixme from 8153102e',
      'test/browser/navShell.browser.spec.ts',
      "test.fixme('drawer is never shown open on first load', async ({ page }) => {\n" +
        "  await page.goto('/');\n" +
        '});\n',
    ],
    [
      'playwright/missing-playwright-await',
      'the nav-state assertion from 0a2e7a63 without its await',
      'test/browser/navShell.browser.spec.ts',
      "test('keeps the desktop nav open', async ({ page }) => {\n" +
        "  expect(page.locator('.frogbot-nav-shell')).toHaveAttribute('data-nav-state', 'desktop-nav-open');\n" +
        '});\n',
    ],
    [
      'playwright/no-wait-for-timeout',
      'the nav-state check from 0a2e7a63 after a fixed wait',
      'test/browser/navShell.browser.spec.ts',
      "test('keeps the desktop nav open', async ({ page }) => {\n" +
        '  await page.waitForTimeout(500);\n' +
        "  await expect(page.locator('.frogbot-nav-shell')).toHaveAttribute('data-nav-state', 'desktop-nav-open');\n" +
        '});\n',
    ],
    [
      'playwright/no-conditional-in-test',
      'sidebar toggle from 36d03476',
      'test/browser/customField.browser.spec.ts',
      "test('opens the sidebar', async ({ page }) => {\n" +
        "  const shell = page.locator('.frogbot-nav-shell');\n\n" +
        "  if ((await shell.getAttribute('data-nav-state')) === 'desktop-nav-closed') {\n" +
        '    await page.locator(\'button[aria-label="Open sidebar"]\').click();\n' +
        '  }\n' +
        '});\n',
    ],
  ])('reports %s as an error in browser specs: %s', (rule, _source, filename, code) => {
    expect(
      reported(filename, "import { expect, test } from '@playwright/test';\n\n" + code),
    ).toContain(`${rule} 2`);
  });

  it.each([
    [
      'vitest/no-disabled-tests',
      'it.skip placeholder from 0c41c04f',
      'test/chat/persistence.int.spec.ts',
      "it.skip('anonymous caller vs. another anonymous caller chat');\n",
    ],
    [
      'vitest/valid-title',
      'ticket number in the it.todo title from 0c41c04f',
      'test/chat/persistence.int.spec.ts',
      "it.todo('anonymous caller vs. another anonymous caller chat (.idea/issue_triage.md ticket 33)');\n",
    ],
    [
      'vitest/valid-title',
      'ticket number in the title from 72fedca3',
      'test/unit/scripts/checkTicketDocs.spec.ts',
      "it('rejects a research Status that is not Draft or Done (ticket 242 research)', () => {\n" +
        '  expect(true).toBe(true);\n' +
        '});\n',
    ],
    [
      'vitest/valid-title',
      'the title from 72fedca3 with a should prefix',
      'test/unit/scripts/checkTicketDocs.spec.ts',
      "it('should reject a research Status that is not Draft or Done', () => {\n" +
        '  expect(true).toBe(true);\n' +
        '});\n',
    ],
    [
      'vitest/no-conditional-in-test',
      'branching assertion from 00b86c61',
      'test/auth/session.int.spec.ts',
      "it('rolls back the stale transaction', async () => {\n" +
        '  const result: unknown = await Promise.resolve(new Response());\n\n' +
        '  if (result instanceof Response) expect(result.status).toBe(500);\n' +
        '  else expect(result).toBeInstanceOf(Error);\n' +
        '});\n',
    ],
  ])('reports %s as an error: %s', (rule, _source, filename, code) => {
    expect(reported(filename, "import { expect, it } from 'vitest';\n\n" + code)).toContain(
      `${rule} 2`,
    );
  });

  it.each([
    [
      'Wait for a condition, not a fixed time',
      'readiness poll from 699cc5fc',
      'test/e2e/coldRest.e2e.spec.ts',
      'beforeAll(async () => {\n' +
        '  for (;;) {\n' +
        '    await new Promise((r) => setTimeout(r, 2000));\n' +
        '  }\n' +
        '});\n',
    ],
    [
      'Wait for a condition, not a fixed time',
      'timers/promises import from 00b86c61',
      'test/auth/session.int.spec.ts',
      "import { setTimeout } from 'node:timers/promises';\n\n" +
        "it('expires the session', async () => {\n" +
        '  await setTimeout(10);\n' +
        '  expect(true).toBe(true);\n' +
        '});\n',
    ],
    [
      'Wait for a condition, not a fixed time',
      'prompt-cache retry from 8ce74766',
      'test/gateway/live/scenarios.e2e.spec.ts',
      "it('reports cached tokens', async () => {\n" +
        '  await sleep(3000);\n' +
        '  expect(true).toBe(true);\n' +
        '});\n',
    ],
    [
      'No try in a test body; clean up in an after hook',
      'logout wait from 00b86c61',
      'test/auth/session.int.spec.ts',
      "it('makes real HTTP logout wait for the issuer read', async () => {\n" +
        '  try {\n' +
        '    expect(await Promise.resolve(true)).toBe(true);\n' +
        '  } finally {\n' +
        '    vi.useRealTimers();\n' +
        '  }\n' +
        '});\n',
    ],
    [
      'Integration, E2E and browser specs use the real modules; move module mocks to a unit test',
      'rank fusion mock from 9a58a959',
      'test/search/mongodb/hybrid.int.spec.ts',
      "vi.mock('../../../packages/db-mongodb/src/search/supportsRankFusion.js', () => ({\n" +
        '  supportsRankFusion: () => Promise.resolve(false),\n' +
        '}));\n\n' +
        "it('falls back without rank fusion', () => {\n" +
        '  expect(true).toBe(true);\n' +
        '});\n',
    ],
  ])('bans in specs: %s (%s)', (message, _source, filename, code) => {
    expect(
      reported(
        filename,
        "import { beforeAll, expect, it, vi } from 'vitest';\n\n" +
          'declare function sleep(ms: number): Promise<void>;\n\n' +
          code,
      ),
    ).toContain(`no-restricted-syntax: ${message}`);
  });

  it('allows the timeout guard and the try in a helper from 00b86c61 in an E2E spec', () => {
    expect(
      lintSpec(
        'test/e2e/coldRest.e2e.spec.ts',
        "import { expect, it } from 'vitest';\n\n" +
          'function withTimeout<T>(promise: Promise<T>) {\n' +
          '  return Promise.race([\n' +
          '    promise,\n' +
          "    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), 1000)),\n" +
          '  ]);\n' +
          '}\n\n' +
          'async function readOrNull(read: () => Promise<number>) {\n' +
          '  try {\n' +
          '    return await read();\n' +
          '  } catch {\n' +
          '    return null;\n' +
          '  }\n' +
          '}\n\n' +
          "it('reads the user', async () => {\n" +
          '  expect(await withTimeout(readOrNull(() => Promise.resolve(1)))).toBe(1);\n' +
          '});\n',
      ),
    ).toEqual([]);
  });
});

describe('typed and React lint', () => {
  const TYPED_TIMEOUT = 60_000;

  function emptySuppressions() {
    const dir = mkdtempSync(path.join(tmpdir(), 'frogbot-lint-'));
    const suppressions = path.join(dir, 'eslint-suppressions.json');

    temporary.push(dir);
    writeFileSync(suppressions, '{}');

    return suppressions;
  }

  function reported(filename: string, code: string) {
    const args = ['--format', 'json', '--suppressions-location', emptySuppressions()];

    return messages(lintText(filename, code, args).stdout).map(
      ({ ruleId, severity }) => `${ruleId} ${severity}`,
    );
  }

  // oxlint reads no stdin, so the code goes to a temporary file outside every tsconfig, which
  // tsgolint lints in an inferred program, under the repo's `.oxlintrc.json`.
  function typed(filename: string, code: string) {
    const dir = mkdtempSync(path.join(tmpdir(), 'frogbot-typed-lint-'));
    const file = path.join(dir, path.basename(filename));

    temporary.push(dir);
    writeFileSync(file, code);

    const result = spawnSync(
      oxlintBin,
      ['-c', path.join(root, '.oxlintrc.json'), '--format', 'json', file],
      { cwd: root, encoding: 'utf8' },
    );

    return JSON.parse(result.stdout).diagnostics.map(
      ({ code, severity }: { code: string; severity: string }) =>
        `${code.replace(/^(\w+)\((.+)\)$/, '$1/$2')} ${severity}`,
    );
  }

  it.each([
    [
      'react-hooks/exhaustive-deps',
      'the calendar load effect from cb04a783',
      'packages/next/src/views/Calendar/CalendarView.client.tsx',
      "'use client';\n" +
        "import { useEffect } from 'react';\n\n" +
        'export function CalendarView({ date }: { date: string }) {\n' +
        '  const load = async (signal: AbortSignal) => {\n' +
        '    await fetch(`/api/events?date=${date}`, { signal });\n' +
        '  };\n\n' +
        '  useEffect(() => {\n' +
        '    const controller = new AbortController();\n' +
        '    void load(controller.signal);\n' +
        '    return () => controller.abort();\n' +
        '  }, [date]);\n\n' +
        '  return null;\n' +
        '}\n',
    ],
    [
      'react-hooks/rules-of-hooks',
      'the useState in a mocked provider from 9d2f0561',
      'test/ui/next/elements/StepNavReset.spec.tsx',
      "import type { ReactNode } from 'react';\n" +
        "import { useState } from 'react';\n\n" +
        'export const mocks = {\n' +
        '  StepNavProvider: undefined as unknown as (props: { children: ReactNode }) => ReactNode,\n' +
        '};\n\n' +
        'mocks.StepNavProvider = ({ children }: { children: ReactNode }) => {\n' +
        '  const [stepNav] = useState<string[]>([]);\n\n' +
        '  return stepNav.length > 0 ? children : null;\n' +
        '};\n',
    ],
    [
      'jsx-a11y/click-events-have-key-events',
      'the collapsed sidebar strip from c8419043',
      'packages/next/src/elements/Nav/AppSidebar.tsx',
      'export function AppSidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {\n' +
        '  return (\n' +
        '    <div data-collapsed={!open} onClick={!open ? onToggle : undefined}>\n' +
        '      <nav />\n' +
        '    </div>\n' +
        '  );\n' +
        '}\n',
    ],
  ])('pnpm lint reports %s as an error: %s', (rule, _source, filename, code) => {
    expect(reported(filename, code)).toContain(`${rule} 2`);
  });

  const floatingPromise =
    'declare const chat: { processAction(action: object, options: object): Promise<void> };\n\n' +
    'export async function handleAction(action: object, messageId: string) {\n' +
    '  chat.processAction({ ...action, messageId }, {});\n' +
    '}\n';

  it.each([
    [
      'typescript/no-floating-promises',
      'the unawaited Teams processAction from c608750b',
      'packages/pieces/piece-microsoft-teams/src/adapter.ts',
      floatingPromise,
    ],
    [
      'typescript/await-thenable',
      'the awaited Slack config from 328088a6',
      'packages/pieces/piece-slack/src/index.ts',
      'declare const req: { frogbot: { config: { _internal: { payloadConfig: Promise<object> } } } };\n\n' +
        'export async function payloadConfig() {\n' +
        '  const config = await req.frogbot.config;\n\n' +
        '  return config._internal.payloadConfig;\n' +
        '}\n',
    ],
    [
      'typescript/no-misused-promises',
      'the promise tested as a condition in resolveConfig from d45e2c40',
      'packages/richtext-lexical/src/utilities/resolveConfig.ts',
      'declare const resolved: { _internal: { payloadConfig: Promise<object> } };\n\n' +
        'export function assertConfig() {\n' +
        "  if (!resolved?._internal?.payloadConfig) throw new Error('no config');\n" +
        '}\n',
    ],
  ])(
    'pnpm check typed-lint reports %s as an error: %s',
    (rule, _source, filename, code) => {
      expect(typed(filename, code)).toContain(`${rule} error`);
    },
    TYPED_TIMEOUT,
  );

  it(
    'pnpm check typed-lint allows the async onClick from 1ba6d933, as Payload does',
    () => {
      expect(
        typed(
          'packages/next/src/elements/ViewSwitcher/index.client.tsx',
          'declare global {\n' +
            '  namespace JSX {\n' +
            '    interface IntrinsicElements {\n' +
            '      a: { children?: unknown; href?: string; onClick?: (event: Event) => void };\n' +
            '    }\n' +
            '  }\n' +
            '}\n\n' +
            'declare function setPreference(key: string, value: object): Promise<void>;\n\n' +
            'export function ViewLink({ slug }: { slug: string }) {\n' +
            '  return (\n' +
            '    <a\n' +
            '      href={`/${slug}`}\n' +
            '      onClick={async (event) => {\n' +
            '        event.preventDefault();\n' +
            "        await setPreference('frogbot:collection-view', { view: slug });\n" +
            '      }}\n' +
            '    >\n' +
            '      {slug}\n' +
            '    </a>\n' +
            '  );\n' +
            '}\n',
        ),
      ).toEqual([]);
    },
    TYPED_TIMEOUT,
  );

  it('pnpm lint passes the floating promise from c608750b, which only the typed run sees', () => {
    expect(
      reported('packages/pieces/piece-microsoft-teams/src/adapter.ts', floatingPromise),
    ).toEqual([]);
  });

  it('runs the typed rules in plain pnpm check, pnpm check --full and the pnpm ticket land gate', () => {
    expect(fullOnlyChecks()).not.toContain('typed-lint');
    expect(BASE_GATES).toContain('check --full');
  });

  it('passes a known violation, which .oxlintrc.json warns on, and prints new ones', () => {
    const stdout = JSON.stringify({
      diagnostics: [
        {
          code: 'typescript(no-unnecessary-type-assertion)',
          severity: 'warning',
          message: 'This assertion is unnecessary.',
          filename: 'test/a.spec.ts',
          labels: [{ span: { line: 3 } }],
        },
        {
          code: 'typescript(no-floating-promises)',
          severity: 'error',
          message: 'Promises must be awaited, add void operator to ignore.\nmore',
          filename: 'test/a.spec.ts',
          labels: [{ span: { line: 9 } }],
        },
      ],
    });

    expect(
      typedLintLines(
        { code: 1, stdout, stderr: '' },
        { known: [{ file: 'test/a.spec.ts', rule: 'typescript/no-unnecessary-type-assertion' }] },
      ),
    ).toEqual([
      'test/a.spec.ts:9 typescript/no-floating-promises Promises must be awaited, add void operator to ignore.',
    ]);
  });

  it('fails a known violation that no longer fails', () => {
    expect(
      typedLintLines(
        { code: 0, stdout: '{ "diagnostics": [] }', stderr: '' },
        { known: [{ file: 'test/a.spec.ts', rule: 'typescript/require-await' }] },
      ),
    ).toEqual([
      'test/a.spec.ts:0 typescript/require-await no longer fails; remove it from .oxlintrc.json',
    ]);
  });

  it('prints what oxlint said when it printed no JSON', () => {
    expect(
      typedLintLines({
        code: 1,
        stdout: '',
        stderr: 'Failed to parse oxlint configuration file.\n',
      }),
    ).toEqual(['Failed to parse oxlint configuration file.']);
  });

  it('reads the known violations in the linted files from the warn overrides in .oxlintrc.json', () => {
    const config = {
      overrides: [
        {
          files: ['test/a.spec.ts', 'test/b.spec.ts'],
          rules: { 'typescript/require-await': 'warn' },
        },
        { files: ['test/c.spec.ts'], rules: { 'typescript/require-await': 'off' } },
      ],
    };

    expect(exceptions(config, null)).toEqual([
      { file: 'test/a.spec.ts', rule: 'typescript/require-await' },
      { file: 'test/b.spec.ts', rule: 'typescript/require-await' },
    ]);

    expect(exceptions(config, ['test/b.spec.ts', 'test/c.spec.ts'])).toEqual([
      { file: 'test/b.spec.ts', rule: 'typescript/require-await' },
    ]);
  });

  it('pnpm check typed-lint lints only the lintable changed files, as Payload lint-staged does', () => {
    const command = typedLintCommand([], () => [
      'docs/guides/lint.md',
      'packages/frogbot/src/config/sanitize.ts',
      'packages/ui/src/chat/markdown.tsx',
      'scripts/check-typed-lint.mjs',
      'test/unit/scripts/lint.spec.ts',
    ]);

    expect(command?.targets).toEqual([
      'packages/frogbot/src/config/sanitize.ts',
      'packages/ui/src/chat/markdown.tsx',
      'test/unit/scripts/lint.spec.ts',
    ]);

    expect(command?.args.slice(0, 4)).toEqual([
      ...(command?.targets ?? []),
      '--no-error-on-unmatched-pattern',
    ]);

    expect(command?.args).not.toContain('.');
  });

  it('pnpm check typed-lint --all lints the whole repo and passes the other args to oxlint', () => {
    const command = typedLintCommand(['--all', '--fix'], () => [
      'packages/frogbot/src/config/sanitize.ts',
    ]);

    expect(command?.targets).toBeNull();
    expect(command?.args[0]).toBe('.');
    expect(command?.args).toContain('--fix');
    expect(command?.args).not.toContain('--all');
    expect(command?.args).not.toContain('packages/frogbot/src/config/sanitize.ts');
  });

  it.each(['.oxlintrc.json', 'test/ui/tsconfig.json', 'tsconfig.base.json'])(
    'pnpm check typed-lint lints the whole repo when %s changed, since it changes types in unchanged files',
    (config) => {
      const command = typedLintCommand([], () => ['packages/ui/src/vitest.setup.ts', config]);

      expect(command?.targets).toBeNull();
      expect(command?.args[0]).toBe('.');
    },
  );

  it('pnpm check typed-lint skips when no changed file is lintable', () => {
    expect(typedLintCommand([], () => [])).toBeNull();

    expect(
      typedLintCommand([], () => ['docs/guides/lint.md', 'deleted-in-this-diff.ts']),
    ).toBeNull();
  });
});
