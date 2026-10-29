import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  checkAppRoot,
  findAppRoot,
} from '../../../../packages/plugins/plugin-dojo/src/cli/appRoot.js';
import { tempDir, writeFiles } from './helpers.js';

const app = {
  'package.json': '{"name":"deals"}',
  'pnpm-lock.yaml': '',
};

describe('findAppRoot', () => {
  it('finds the root from a subfolder', async () => {
    const root = await tempDir();

    await writeFiles(root, { ...app, 'frogbot.config.ts': '', 'scripts/deep/x.ts': '' });

    expect(findAppRoot({ cwd: join(root, 'scripts/deep'), env: {} })).toBe(root);
  });

  it('uses the parent of src/', async () => {
    const root = await tempDir();

    await writeFiles(root, { ...app, 'src/frogbot.config.ts': '' });

    expect(findAppRoot({ cwd: root, env: {} })).toBe(root);
    expect(findAppRoot({ cwd: join(root, 'src'), env: {} })).toBe(root);
  });

  it('honours FROGBOT_CONFIG_PATH', async () => {
    const root = await tempDir();

    await writeFiles(root, { 'apps/deals/src/frogbot.config.ts': '', 'frogbot.config.ts': '' });

    expect(
      findAppRoot({ cwd: root, env: { FROGBOT_CONFIG_PATH: 'apps/deals/src/frogbot.config.ts' } }),
    ).toBe(join(root, 'apps/deals'));
    expect(() => findAppRoot({ cwd: root, env: { FROGBOT_CONFIG_PATH: 'missing.ts' } })).toThrow(
      `FROGBOT_CONFIG_PATH points to a missing file: ${join(root, 'missing.ts')}`,
    );
  });

  it('stops with no config', async () => {
    const root = await tempDir();

    expect(() => findAppRoot({ cwd: root, env: {} })).toThrow(
      'No frogbot.config.ts here or in any parent folder. Run share from inside the app.',
    );
  });
});

describe('checkAppRoot', () => {
  it('passes with a package.json and a supported lockfile', async () => {
    for (const lockfile of ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']) {
      const root = await tempDir();

      await writeFiles(root, { 'package.json': '{}', [lockfile]: '', 'bun.lock': '' });

      expect(() => checkAppRoot(root)).not.toThrow();
    }
  });

  it('stops with no package.json', async () => {
    const root = await tempDir();

    await writeFiles(root, { 'pnpm-lock.yaml': '' });

    expect(() => checkAppRoot(root)).toThrow(`No package.json in ${root}.`);
  });

  it.each(['bun.lock', 'bun.lockb'])('stops on %s alone', async (lockfile) => {
    const root = await tempDir();

    await writeFiles(root, { 'package.json': '{}', [lockfile]: '' });

    expect(() => checkAppRoot(root)).toThrow(
      "Bun isn't supported yet; run `pnpm install` to make a lockfile.",
    );
  });

  it('stops with no lockfile', async () => {
    const root = await tempDir();

    await writeFiles(root, { 'package.json': '{}' });

    expect(() => checkAppRoot(root)).toThrow('No lockfile: run `pnpm install` first.');
  });
});
