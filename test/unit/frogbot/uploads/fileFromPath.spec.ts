import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { withFileFromPath } from '../../../../packages/frogbot/src/uploads/fileFromPath.js';

const fixture = async (name: string, data: string | Buffer) => {
  const path = join(await mkdtemp(join(tmpdir(), 'frogbot-file-from-path-')), name);

  await writeFile(path, data);

  return path;
};

describe('withFileFromPath', () => {
  it.each([
    ['notes.txt', 'text/plain'],
    ['rows.CSV', 'text/csv'],
    ['data.json', 'application/json'],
    ['readme.md', 'text/markdown'],
    ['blob.unknown', 'application/octet-stream'],
  ])('reads %s with the MIME type %s and drops filePath', async (name, mimetype) => {
    const filePath = await fixture(name, 'ribbit');
    const result = await withFileFromPath({ collection: 'files', filePath });

    expect(result).not.toHaveProperty('filePath');
    expect(result).toMatchObject({
      collection: 'files',
      file: { name, mimetype, data: Buffer.from('ribbit') },
    });
  });

  it('keeps the MIME type Payload detects from the content', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const result = await withFileFromPath({ filePath: await fixture('image.txt', png) });

    expect(result).toMatchObject({ file: { mimetype: 'image/png' } });
  });

  it('leaves options without a filePath, or with a file, as they are', async () => {
    const file = { data: Buffer.from('x'), mimetype: 'text/plain', name: 'x.txt', size: 1 };
    const withFile = { file, filePath: '/nowhere.txt' };
    const plain: { collection: string; filePath?: string } = { collection: 'files' };

    expect(await withFileFromPath(withFile)).toBe(withFile);
    expect(await withFileFromPath(plain)).toBe(plain);
  });
});
