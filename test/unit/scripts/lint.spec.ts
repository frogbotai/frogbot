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
  it('fails on the preset warning from the it.skip placeholder added in 0c41c04f', () => {
    const result = lintText(
      'test/chat/persistence.int.spec.ts',
      "import { it } from 'vitest';\n\n" +
        "it.skip('anonymous caller vs. another anonymous caller chat (.idea/issue_triage.md ticket 33)');\n",
    );

    expect(result.code).toBe(1);
    expect(result.output).toContain('vitest/no-disabled-tests');
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
