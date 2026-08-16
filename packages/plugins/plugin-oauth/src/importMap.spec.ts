import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { buildConfig } from '../../../frogbot/src/config/build.js';
import { generateImportMap } from '../../../frogbot/src/importMap/index.js';
import type { FrogbotConfig } from '../../../frogbot/src/types/config.js';
import { googleProvider, oauthPlugin } from './index.js';

vi.mock('@payloadcms/ui', () => ({ Button: () => null }));

const { OAuthLoginButtons } = await import('./client.js');
const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function importMap(adminLoginButtons: boolean) {
  const dir = await mkdtemp(join(tmpdir(), 'frogbot-oauth-importmap-'));

  dirs.push(dir);

  const config = await buildConfig({
    secret: 'test-secret',
    db: { defaultIDType: 'number' } as never,
    collections: [{ slug: 'users', auth: true, fields: [] }],
    plugins: [
      oauthPlugin({
        adminLoginButtons,
        providers: [googleProvider({ clientId: 'id', clientSecret: 'secret', signIn: true })],
      }),
    ],
  } as FrogbotConfig);

  const payloadConfig = await config._internal.payloadConfig;

  payloadConfig.admin.importMap.baseDir = dir;
  payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

  await generateImportMap(payloadConfig);

  return readFile(join(dir, 'importMap.js'), 'utf8');
}

describe('OAuth import map', () => {
  it('registers login buttons only when enabled', async () => {
    expect(await importMap(true)).toContain('"@frogbotai/plugin-oauth/client#OAuthLoginButtons"');
    expect(await importMap(false)).not.toContain(
      '"@frogbotai/plugin-oauth/client#OAuthLoginButtons"',
    );
    expect(OAuthLoginButtons).toBeTypeOf('function');
  });
});
