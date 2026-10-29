import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it, onTestFinished } from 'vitest';

import { createArchive } from '../../../../packages/plugins/plugin-dojo/src/cli/archive.js';
import { tempDir, writeFiles } from './helpers.js';

const execFileAsync = promisify(execFile);

async function entries(file: string): Promise<string[]> {
  const { stdout } = await execFileAsync('tar', ['-tzf', file]);

  return stdout.split('\n').filter(Boolean);
}

describe('createArchive', () => {
  it('packs exactly the listed files', async () => {
    const root = await tempDir();

    await writeFiles(root, { 'package.json': '{}', 'src/page.tsx': 'x', '.env': 'SECRET=1' });

    const archive = await createArchive({ root, files: ['package.json', 'src/page.tsx'] });
    onTestFinished(archive.remove);

    expect((await entries(archive.path)).sort()).toEqual(['package.json', 'src/page.tsx']);
    expect(archive.summary).toMatch(/^Uploading 2 files \(\d+\.\d KB\)$/);
  });

  it('packs a path starting with @ as itself, never as another archive to copy in', async () => {
    const root = await tempDir();

    await writeFiles(root, {
      '@notes': 'notes',
      '@types/env.d.ts': 'declare const x: 1;',
      '.env': 'SECRET=1',
    });

    await execFileAsync('tar', ['-cf', join(root, 'notes'), '-C', root, '.env']);

    const archive = await createArchive({ root, files: ['@notes', '@types/env.d.ts'] });
    onTestFinished(archive.remove);

    expect((await entries(archive.path)).sort()).toEqual(['@notes', '@types/env.d.ts']);
  });

  it('says file for one file', async () => {
    const root = await tempDir();

    await writeFiles(root, { 'package.json': '{}' });

    const archive = await createArchive({ root, files: ['package.json'] });
    onTestFinished(archive.remove);

    expect(archive.summary).toMatch(/^Uploading 1 file \(/);
  });

  it('stops over the limit', async () => {
    const root = await tempDir();

    await writeFiles(root, { 'big.txt': 'x'.repeat(10_000), 'package.json': '{}' });

    await expect(
      createArchive({ root, files: ['package.json', 'big.txt'], limit: 10 }),
    ).rejects.toThrow(
      'Source is 1 MB; the limit is 0.00001 MB. Check .gitignore for large folders.',
    );
  });

  it('stops over the entry limit before packing', async () => {
    const root = await tempDir();
    const files = Array.from({ length: 100_001 }, (_, index) => `f${index}`);

    await expect(createArchive({ root, files })).rejects.toThrow(
      'The source has more than 100,000 files and folders. Check .gitignore for large folders.',
    );
  });
});
