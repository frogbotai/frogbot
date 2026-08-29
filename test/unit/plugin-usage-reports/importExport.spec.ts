import type { FrogbotConfig } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@frogbotai/plugin-import-export', () => {
  throw Object.assign(
    new Error(
      "Cannot find package '@frogbotai/plugin-import-export' imported from /app/node_modules/@frogbotai/plugin-usage-reports/dist/index.js",
    ),
    { code: 'ERR_MODULE_NOT_FOUND' },
  );
});

const { usageReportsPlugin } = await import('../../../packages/plugins/plugin-usage-reports/src/index.js');

function createConfig() {
  return {
    secret: 'test',
    db: {},
    collections: [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'ai-usage', usageLog: true, fields: [] },
    ],
    ai: { providers: { openai: { apiKey: 'test' } } },
  } as FrogbotConfig;
}

describe('usageReportsPlugin without @frogbotai/plugin-import-export', () => {
  it('builds the config and adds no import or export wiring', async () => {
    const result = await usageReportsPlugin()(createConfig());
    const usage = result.collections.find((item) => item.slug === 'ai-usage');

    expect(result.endpoints?.some((item) => item.path === '/usage/report')).toBe(true);
    expect(result.collections.map((item) => item.slug)).toEqual(['users', 'ai-usage']);
    expect(usage?.admin?.components?.listMenuItems).toBeUndefined();
    expect(result.admin?.components?.providers).toBeUndefined();
  });
});
