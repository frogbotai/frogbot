import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { resolveSourceDir } from './sourceDir.js';

const dirs: string[] = [];

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'frogbot-source-dir-'));
  dirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('resolveSourceDir', () => {
  it('returns <cwd>/src when it is a directory', async () => {
    const dir = await makeDir();
    await mkdir(join(dir, 'src'));

    expect(resolveSourceDir(dir)).toBe(join(dir, 'src'));
  });

  it('returns the cwd when src does not exist', async () => {
    const dir = await makeDir();

    expect(resolveSourceDir(dir)).toBe(dir);
  });

  it('returns the cwd when src is a file', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'src'), '');

    expect(resolveSourceDir(dir)).toBe(dir);
  });
});
