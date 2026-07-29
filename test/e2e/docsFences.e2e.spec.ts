import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    expect(result.output).toContain(`${join('.idea', 'tmp', dir.split('/').at(-1)!, 'fixture.mdx')}:3`);
    expect(result.output).not.toContain('fixture.mdx:7');
  });

  it('accepts tagged fences', async () => {
    const dir = fixture('# Example\n\n```text\nplain\n```\n\n~~~ts\nconst tagged = true\n~~~\n');
    const result = await run(dir);

    expect(result.code).toBe(0);
    expect(result.output).toContain('[check-docs-fences] OK - 1 files and 2 fences scanned.');
  });
});
