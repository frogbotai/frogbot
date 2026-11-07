import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import type { FrogBotConfig, Plugin } from 'frogbot';
import { describe, expect, it } from 'vitest';

import { findMissingIcons } from '../../../packages/frogbot/src/bin/check.js';
import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import { aiPolicyPlugin } from '../../../packages/plugins/plugin-ai-policy/src/index.js';
import { auditLogPlugin } from '../../../packages/plugins/plugin-audit-log/src/index.js';
import type { CaptureStorage } from '../../../packages/plugins/plugin-capture/src/index.js';
import { capturePlugin } from '../../../packages/plugins/plugin-capture/src/index.js';
import { dojo } from '../../../packages/plugins/plugin-dojo/src/index.js';
import { checks, evalsPlugin } from '../../../packages/plugins/plugin-evals/src/index.js';
import { formsPlugin } from '../../../packages/plugins/plugin-forms/src/index.js';
import { importExportPlugin } from '../../../packages/plugins/plugin-import-export/src/index.js';
import { mcpPlugin } from '../../../packages/plugins/plugin-mcp/src/index.js';
import { nestedDocsPlugin } from '../../../packages/plugins/plugin-nested-docs/src/index.js';
import { redirectsPlugin } from '../../../packages/plugins/plugin-redirects/src/index.js';
import { rolesPlugin } from '../../../packages/plugins/plugin-roles/src/index.js';
import { seoPlugin } from '../../../packages/plugins/plugin-seo/src/index.js';
import { usageReportsPlugin } from '../../../packages/plugins/plugin-usage-reports/src/index.js';

const plugins: Record<string, Plugin[]> = {
  'ai-policy': [aiPolicyPlugin()],
  'api-keys': [apiKeysPlugin()],
  'audit-log': [auditLogPlugin()],
  capture: [capturePlugin({ storage: {} as CaptureStorage })],
  dojo: [dojo()],
  evals: [evalsPlugin({ scorers: { usedLookup: checks.calledTool('findPages') } })],
  forms: [formsPlugin({ collections: ['pages'] })],
  'import-export': [importExportPlugin({ collections: [{ slug: 'pages' }] })],
  mcp: [apiKeysPlugin(), mcpPlugin()],
  'nested-docs': [nestedDocsPlugin({ collections: ['pages'] })],
  redirects: [redirectsPlugin({ collections: ['pages'] })],
  roles: [rolesPlugin()],
  seo: [seoPlugin({ collections: ['pages'] })],
  'usage-reports': [usageReportsPlugin()],
};

async function buildCollections(plugins: Plugin[]) {
  const config = await buildConfig({
    secret: 'test-secret',
    db: { defaultIDType: 'number' } as FrogBotConfig['db'],
    ai: { providers: { openai: { apiKey: 'sk-test' } } },
    agents: [{ slug: 'support', model: 'openai/gpt-4o-mini', instructions: 'Help' }],
    collections: [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'pages', admin: { icon: 'file' }, fields: [{ name: 'title', type: 'text' }] },
    ],
    plugins,
  });

  return (await config._internal.payloadConfig).collections;
}

async function sidebarCollectionsWithoutIcons(plugins: Plugin[]): Promise<string[]> {
  return findMissingIcons(await buildCollections(plugins)).map(({ path }) => path ?? '');
}

describe('first-party collection icons', () => {
  it.each(Object.entries(plugins))(
    'plugin-%s gives every sidebar collection an icon',
    async (_name, plugins) => {
      expect(await sidebarCollectionsWithoutIcons(plugins)).toEqual([]);
    },
  );

  it('keeps an icon set through the redirects overrides', async () => {
    const collections = await buildCollections([
      redirectsPlugin({ collections: ['pages'], overrides: { admin: { group: 'Site' } } }),
      redirectsPlugin({
        collections: ['pages'],
        overrides: { slug: 'moves', admin: { icon: 'web' } as never },
      }),
    ]);

    const icons = Object.fromEntries(
      collections.map(({ slug, admin }) => [slug, (admin as { icon?: unknown }).icon]),
    );

    expect(icons).toMatchObject({ redirects: 'link-square', moves: 'web' });
  });
});
