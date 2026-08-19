import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const tempRoot = join(repoRoot, '.idea', 'tmp');
const script = join(repoRoot, 'scripts', 'check-docs-fences.mjs');
const tempDirs: string[] = [];

function run(root: string) {
  return new Promise<{ code: number; output: string }>((resolveExit) => {
    const child = spawn(process.execPath, [script, root], { cwd: repoRoot });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk));
    child.on('close', (code) => resolveExit({ code: code ?? 1, output }));
  });
}

function fixture(content: string) {
  const dir = mkdtempSync(join(tempRoot, 'docs-fences-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, 'fixture.mdx'), content);
  return dir;
}

describe('docs fences gate', () => {
  beforeAll(() => mkdirSync(tempRoot, { recursive: true }));

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('finds no untagged fences in docs', async () => {
    const result = await run(join(repoRoot, 'docs'));
    expect(result.output).toContain('[check-docs-fences] OK');
    expect(result.code).toBe(0);
  });

  it('reports an untagged fence location', async () => {
    const dir = fixture('# Example\n\n```\nplain\n```\n\n```ts\nconst tagged = true\n```\n');
    const result = await run(dir);

    expect(result.code).toBe(1);
    expect(result.output).toContain(
      `${join('.idea', 'tmp', dir.split('/').at(-1)!, 'fixture.mdx')}:3`,
    );
    expect(result.output).not.toContain('fixture.mdx:7');
  });

  it('accepts tagged fences', async () => {
    const dir = fixture('# Example\n\n```text\nplain\n```\n\n~~~ts\nconst tagged = true\n~~~\n');
    const result = await run(dir);

    expect(result.code).toBe(0);
    expect(result.output).toContain('[check-docs-fences] OK - 1 files and 2 fences scanned.');
  });

  it('reports commands in plain-text fences', async () => {
    const dir = fixture(
      '# Example\n\n```text\nnpm run frogbot migrate\n```\n\n```txt\ngit status\n```\n\n```plaintext\ncurl https://example.com\n```\n',
    );
    const result = await run(dir);

    expect(result.code).toBe(1);
    const file = join('.idea', 'tmp', dir.split('/').at(-1)!, 'fixture.mdx');
    expect(result.output).toContain(`${file}:4`);
    expect(result.output).toContain(`${file}:8`);
    expect(result.output).toContain(`${file}:12`);
  });

  it('accepts legitimate plain-text fences', async () => {
    const dir = fixture(
      '# Example\n\n```text\nhttps://example.com\n```\n\n```txt\nsrc/\n  index.ts\n```\n\n```txt\n/connect\n```\n\n```plaintext\nKEY=value\n```\n',
    );
    const result = await run(dir);

    expect(result.code).toBe(0);
    expect(result.output).toContain('[check-docs-fences] OK - 1 files and 4 fences scanned.');
  });

  it('uses bash for migrations commands', () => {
    const migrations = readFileSync(join(repoRoot, 'docs', 'database', 'migrations.mdx'), 'utf8');

    expect(migrations).not.toContain('```text\nnpm run frogbot migrate');
    expect(migrations.match(/^```bash\nnpm run frogbot migrate/gm)).toHaveLength(7);
  });
});
