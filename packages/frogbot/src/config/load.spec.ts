import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { loadConfig } from './load.js';

const dirs: string[] = [];
const CONFIG = 'export default { collections: [], _internal: {} };\n';

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'frogbot-load-config-'));
  dirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('frogbot loadConfig', () => {
  it('finds a config inside src/', async () => {
    const dir = await makeDir();
    await mkdir(join(dir, 'src'));
    await writeFile(join(dir, 'src', 'frogbot.config.mjs'), CONFIG);

    await expect(loadConfig({ cwd: dir })).resolves.toMatchObject({ collections: [] });
  });

  it('prefers src/ over the project root when both exist', async () => {
    const dir = await makeDir();
    await mkdir(join(dir, 'src'));
    await writeFile(join(dir, 'src', 'frogbot.config.mjs'), 'export default { collections: [1], _internal: {} };\n');
    await writeFile(join(dir, 'frogbot.config.mjs'), 'export default { collections: [2], _internal: {} };\n');

    await expect(loadConfig({ cwd: dir })).resolves.toMatchObject({ collections: [1] });
  });

  it('throws when no config exists up the tree', async () => {
    const dir = await makeDir();

    await expect(loadConfig({ cwd: dir })).rejects.toThrow('could not find frogbot.config');
  });

  it.todo('finds frogbot.config.ts in the cwd');
  it.todo('walks up parent directories until it finds a config file');
  it.todo('accepts frogbot.config.ts, frogbot.config.mjs, and frogbot.config.js');
  it.todo('respects an absolute FROGBOT_CONFIG_PATH override');
  it.todo('respects a relative FROGBOT_CONFIG_PATH (resolved against cwd)');
  it.todo('throws `[frogbot] FROGBOT_CONFIG_PATH points to a missing file:` when the override does not exist');
  it.todo('throws `[frogbot] failed to load <path>` wrapping the underlying cause on import failure');
  it.todo('throws `[frogbot] <path> has no default export` when the file has no default export');
  it.todo('awaits a Promise default export');
  it.todo('rejects a default export missing `collections` with `[frogbot] … is not a SanitizedConfig`');
  it.todo('returns the sanitized config object on success');
});
