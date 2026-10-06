import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { eslintResult } from '../../../scripts/check.mjs';

const root = path.resolve(import.meta.dirname, '../../..');

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const eslintBin = path.join(root, 'node_modules', '.bin', 'eslint');

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
        '  const payloadConfig: unknown = {};\n' +
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
