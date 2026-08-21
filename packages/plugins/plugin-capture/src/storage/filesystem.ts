import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CaptureStorage } from '../types.js';

export function filesystemCaptureStorage(root = '.frogbot/captures'): CaptureStorage {
  const resolve = (key: string) => {
    const target = path.resolve(root, key);
    const base = `${path.resolve(root)}${path.sep}`;
    if (!target.startsWith(base)) throw new Error('Invalid capture key');
    return target;
  };
  return {
    async put(key, bytes) {
      const target = resolve(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    },
    async get(key) {
      return readFile(resolve(key));
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
    async *list(prefix) {
      const directory = resolve(prefix || '.');
      for (const entry of await readdir(directory, { recursive: true }).catch(() => [])) {
        const key = path.posix.join(prefix, String(entry).split(path.sep).join('/'));
        if (key.endsWith('.json.gz')) yield key;
      }
    },
  };
}
