import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { generateImportMap } from '../../../packages/frogbot/src/bin/generateImportMap/index.js';
import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import type { FrogBotConfig } from '../../../packages/frogbot/src/config/types.js';
import { dojo } from '../../../packages/plugins/plugin-dojo/src/index.js';

const badge = '@frogbotai/plugin-dojo/client#DojoBadge';

const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('dojo() import map', () => {
  it('puts the badge in an import map generated without DOJO=1, as Dojo builds images', async () => {
    vi.stubEnv('DOJO', undefined);

    const dir = await mkdtemp(join(tmpdir(), 'frogbot-dojo-importmap-'));
    dirs.push(dir);
    const config = await buildConfig({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as unknown as FrogBotConfig['db'],
      collections: [{ slug: 'users', auth: true, fields: [] }],
      plugins: [dojo()],
    });

    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    expect(payloadConfig.admin.components.providers).not.toContain(badge);

    await generateImportMap(payloadConfig);
    const output = await readFile(join(dir, 'importMap.js'), 'utf8');

    expect(output).toContain("from '@frogbotai/plugin-dojo/client'");
    expect(output).toContain(`'${badge}'`);
  });
});
