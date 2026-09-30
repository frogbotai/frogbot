import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const tempRoot = join(repoRoot, '.idea', 'tmp');
const script = join(repoRoot, 'scripts', 'check-docs-references.mjs');
const tempDirs: string[] = [];

function run(directory?: string) {
  const args = directory ? [script, directory] : [script];

  return new Promise<{ code: number; output: string }>((resolveExit, reject) => {
    const child = spawn(process.execPath, args, { cwd: repoRoot });
    let output = '';

    child.stdout.on('data', (chunk: Buffer) => (output += chunk));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolveExit({ code: code ?? 1, output }));
  });
}

function fixture(content: string) {
  const dir = mkdtempSync(join(tempRoot, 'docs-references-'));

  tempDirs.push(dir);
  writeFileSync(join(dir, 'fixture.mdx'), content);

  return dir;
}

describe('docs references gate', () => {
  beforeAll(() => mkdirSync(tempRoot, { recursive: true }));

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('finds no nonexistent references in the real repo', async () => {
    const result = await run();

    expect(result.output).toContain('[check-docs-references] OK');
    expect(result.code).toBe(0);
  });

  it('reports nonexistent command and import locations in a fixture directory', async () => {
    const dir = fixture(
      "# Example\n\n```bash\nfrogbot generate:db-schema\n```\n\n```ts\nimport { a } from 'frogbot/shared'\n```\n",
    );

    const file = relative(repoRoot, join(dir, 'fixture.mdx'));

    const result = await run(dir);

    expect(result.code).toBe(1);
    expect(result.output).toContain(
      `${file}:4  command frogbot generate:db-schema (command is not registered)`,
    );
    expect(result.output).toContain(`${file}:8  import frogbot/shared (subpath is not exported)`);
    expect(result.output).toContain('[check-docs-references] FAIL - 2 issue(s) found.');
    expect(result.output).not.toContain('stale entry');
  });

  it.each([
    ['bash', 'pnpm add @frogbotai/ui frogbot react'],
    ['ts', "import frogbot from 'frogbot'"],
    ['bash', 'npm run frogbot migrate'],
    ['json', '{"command":"frogbot nope"}'],
    ['bash', 'pnpm add @frogbotai/graphql -D'],
  ])('accepts realistic %s code: %s', async (language, content) => {
    const dir = fixture(`\`\`\`${language}\n${content}\n\`\`\`\n`);

    const result = await run(dir);

    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain('[check-docs-references] OK');
  });

  it.each([
    ["```ts\nimport {\n a,\n} from '@frogbotai/next/auth'\n```\n", 4, '@frogbotai/next/auth'],
    ['~~~bash\nfrogbot nope\n~~~\n', 2, 'frogbot nope'],
    ['```bash\necho done && $ pnpm frogbot nope\n```\n', 2, 'frogbot nope'],
    ["```ts\nimport '@frogbotai/ui/icons/../x'\n```\n", 2, '@frogbotai/ui/icons/../x'],
  ])('rejects formatted drift: %s', async (content, line, name) => {
    const dir = fixture(content);
    const file = relative(repoRoot, join(dir, 'fixture.mdx'));

    const result = await run(dir);

    expect(result.code, result.output).toBe(1);
    expect(result.output).toContain(`${file}:${line}  `);
    expect(result.output).toContain(name);
  });
});
