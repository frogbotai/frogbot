import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ generateImportMap: vi.fn() }));

vi.mock('./generateImportMap.js', () => ({ generateImportMap: mocks.generateImportMap }));

import { bin } from './index.js';

describe('frogbot generate:importmap', () => {
  it.todo('loads config from cwd via loadConfig');
  it.todo('generates the import map from the sanitized payload config');
  it.todo('logs `[frogbot] import map written to <path>` when the file changed');
  it.todo('logs `[frogbot] import map unchanged at <path>` when identical');
  it.todo('exits non-zero on any failure with a `[frogbot]` prefixed message');

  it('loads .env before importing the config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'frogbot-importmap-env-'));
    const cwd = process.cwd();
    const argv = process.argv;
    const original = process.env.FROGBOT_TEST_KEY;

    await writeFile(join(dir, '.env'), 'FROGBOT_TEST_KEY=sk-test\n');
    await writeFile(
      join(dir, 'frogbot.config.mjs'),
      'export default { apiKey: process.env.FROGBOT_TEST_KEY };\n',
    );

    delete process.env.FROGBOT_TEST_KEY;
    process.chdir(dir);
    process.argv = ['node', 'frogbot', 'generate:importmap'];
    mocks.generateImportMap.mockImplementationOnce(async () => {
      const config = (await import(pathToFileURL(join(dir, 'frogbot.config.mjs')).href)) as {
        default: { apiKey?: string };
      };
      expect(config.default.apiKey).toBe('sk-test');
    });

    try {
      await bin();
    } finally {
      process.chdir(cwd);
      process.argv = argv;
      if (original === undefined) delete process.env.FROGBOT_TEST_KEY;
      else process.env.FROGBOT_TEST_KEY = original;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
