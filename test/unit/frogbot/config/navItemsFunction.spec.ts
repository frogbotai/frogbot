import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { generateImportMap } from '../../../../packages/frogbot/src/bin/generateImportMap/index.js';
import { rewriteComponentPaths } from '../../../../packages/frogbot/src/config/rewriteComponentPaths.js';
import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';

const navItems = () => [{ icon: 'hmoe', label: 'Unchecked at config time', path: '/a' }];

function makeConfig() {
  return sanitize({
    secret: 'test-secret',
    db: { defaultIDType: 'number' } as never,
    admin: { components: { navItems } },
    collections: [{ slug: 'users', auth: true, fields: [] }],
  });
}

describe('a navItems function', () => {
  it('survives sanitize and the Payload config build untouched', async () => {
    const config = makeConfig();
    const payloadConfig = await config._internal.payloadConfig;

    expect((payloadConfig.admin.components as { navItems?: unknown }).navItems).toBe(navItems);
  });

  it('is skipped by component path rewriting and import-map generation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'frogbot-importmap-nav-fn-'));
    onTestFinished(() => rm(dir, { force: true, recursive: true }));

    const payloadConfig = await makeConfig()._internal.payloadConfig;

    expect(() => rewriteComponentPaths(payloadConfig)).not.toThrow();
    expect((payloadConfig.admin.components as { navItems?: unknown }).navItems).toBe(navItems);

    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);

    expect(await readFile(join(dir, 'importMap.js'), 'utf-8')).not.toContain('hmoe');
  });
});
