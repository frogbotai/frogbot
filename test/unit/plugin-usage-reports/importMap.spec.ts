import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import { generateImportMap } from '../../../packages/frogbot/src/bin/generateImportMap/index.js';
import type { FrogbotConfig } from '../../../packages/frogbot/src/config/types.js';
import { usageReportsPlugin } from '../../../packages/plugins/plugin-usage-reports/src/index.js';

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('usage reports import map', () => {
  it('generates the settings page entry without legacy components', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'frogbot-usage-reports-importmap-'));
    dirs.push(dir);
    const config = await buildConfig({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      collections: [{ slug: 'users', auth: true, fields: [] }],
      ai: { providers: { openai: { apiKey: 'test' } } },
      plugins: [usageReportsPlugin()],
    } as FrogbotConfig);
    const payloadConfig = await config._internal.payloadConfig;
    payloadConfig.admin.importMap.baseDir = dir;
    payloadConfig.admin.importMap.importMapFile = join(dir, 'importMap.js');

    await generateImportMap(payloadConfig);
    const output = await readFile(join(dir, 'importMap.js'), 'utf8');

    expect(output).toContain("from '@frogbotai/plugin-usage-reports/client'");
    expect(output).toContain('"@frogbotai/plugin-usage-reports/client#UsageReports"');
    expect(output).not.toContain('UsageReportsNavLink');
    expect(output).not.toContain('usage-analytics');
  });
});
