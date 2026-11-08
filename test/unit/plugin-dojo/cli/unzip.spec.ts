import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { unzipTo, ZipError } from '../../../../packages/plugins/plugin-dojo/src/cli/data/unzip.js';
import { tempDir } from './helpers.js';

const zipOf = (files: Record<string, string>) =>
  Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([n, t]) => [n, strToU8(t)]))));

const endOf = (zip: Buffer) => zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));

async function unpack(zip: Buffer) {
  const dir = await tempDir();
  const path = join(dir, 'data.zip');

  await writeFile(path, zip);

  return unzipTo({ path, size: zip.length, folder: join(dir, 'out') });
}

describe('unzipTo on a damaged zip', () => {
  it('refuses an entry count larger than the directory', async () => {
    const zip = zipOf({ 'frogbot.db': 'db' });
    const end = endOf(zip);

    zip.writeUInt16LE(2, end + 8);
    zip.writeUInt16LE(2, end + 10);

    await expect(unpack(zip)).rejects.toBeInstanceOf(ZipError);
  });

  it('refuses a local header offset past the end', async () => {
    const zip = zipOf({ 'frogbot.db': 'db' });
    const central = zip.readUInt32LE(endOf(zip) + 16);

    zip.writeUInt32LE(zip.length + 1000, central + 42);

    await expect(unpack(zip)).rejects.toBeInstanceOf(ZipError);
  });

  it('refuses a file and a folder with the same name', async () => {
    await expect(unpack(zipOf({ media: 'file', 'media/a.png': 'png' }))).rejects.toBeInstanceOf(
      ZipError,
    );
  });
});
