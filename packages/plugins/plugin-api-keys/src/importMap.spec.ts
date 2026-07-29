import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { buildConfig } from '../../../frogbot/src/config/build.js';
import { generateImportMap } from '../../../frogbot/src/importMap/index.js';
import type { FrogbotConfig } from '../../../frogbot/src/types/config.js';
import { apiKeysPlugin } from './index.js';

vi.mock('@payloadcms/ui', () => ({
  Button: () => null,
  TextInput: () => null,
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  useListQuery: () => ({ data: { docs: [] }, query: {}, refineListData: vi.fn() }),
}));

const { ApiKeysManager } = await import('./client.js');

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('api keys import map', () => {
  it('generates a resolvable ApiKeysManager entry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'frogbot-api-keys-importmap-'));
    dirs.push(dir);
    const config = await buildConfig({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      collections: [{ slug: 'users', auth: true, fields: [] }],
      plugins: [apiKeysPlugin()],
    } as FrogbotConfig);
    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);
    const output = await readFile(join(dir, 'importMap.js'), 'utf8');

    expect(output).toContain("from '@frogbotai/plugin-api-keys/client'");
    expect(output).toContain('"@frogbotai/plugin-api-keys/client#ApiKeysManager"');
    expect(ApiKeysManager).toBeTypeOf('function');
  });
});
