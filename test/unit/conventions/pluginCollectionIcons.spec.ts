import { apiKeysPlugin as builtApiKeysPlugin } from '@frogbotai/plugin-api-keys';
import type { FrogBotConfig, Plugin } from 'frogbot';
import { describe, expect, it } from 'vitest';

import { collectionsWithoutIcon } from '../../../packages/frogbot/src/admin/icons.js';
import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import { aiCapturePlugin } from '../../../packages/plugins/plugin-ai-capture/src/index.js';
import { aiEvalsPlugin, checks } from '../../../packages/plugins/plugin-ai-evals/src/index.js';
import { aiPolicyPlugin } from '../../../packages/plugins/plugin-ai-policy/src/index.js';
import { aiUsagePlugin } from '../../../packages/plugins/plugin-ai-usage/src/index.js';
import { apiKeysPlugin } from '../../../packages/plugins/plugin-api-keys/src/index.js';
import { auditLogPlugin } from '../../../packages/plugins/plugin-audit-log/src/index.js';
import { dojo } from '../../../packages/plugins/plugin-dojo/src/index.js';
import { formsPlugin } from '../../../packages/plugins/plugin-forms/src/index.js';
import { importExportPlugin } from '../../../packages/plugins/plugin-import-export/src/index.js';
import { mcpPlugin } from '../../../packages/plugins/plugin-mcp/src/index.js';
import { nestedDocsPlugin } from '../../../packages/plugins/plugin-nested-docs/src/index.js';
import { redirectsPlugin } from '../../../packages/plugins/plugin-redirects/src/index.js';
import { rolesPlugin } from '../../../packages/plugins/plugin-roles/src/index.js';
import { seoPlugin } from '../../../packages/plugins/plugin-seo/src/index.js';
import { stripePlugin } from '../../../packages/plugins/plugin-stripe/src/index.js';

const plugins: Record<string, Plugin[]> = {
  'ai-capture': [aiCapturePlugin()],
  'ai-evals': [aiEvalsPlugin({ scorers: { called: checks.calledTool('lookup') } })],
  'ai-policy': [aiPolicyPlugin()],
  'ai-usage': [aiUsagePlugin()],
  'api-keys': [apiKeysPlugin()],
  'audit-log': [auditLogPlugin()],
  dojo: [dojo()],
  forms: [formsPlugin({ collections: ['leads'] })],
  'import-export': [importExportPlugin({ collections: [{ slug: 'pages' }] })],
  mcp: [builtApiKeysPlugin(), mcpPlugin()],
  'nested-docs': [nestedDocsPlugin({ collections: ['pages'] })],
  redirects: [redirectsPlugin({ collections: ['pages'] })],
  roles: [rolesPlugin()],
  seo: [seoPlugin({ collections: ['pages'] })],
  stripe: [stripePlugin({ stripeSecretKey: 'sk_test' })],
};

const app = async (plugins: Plugin[]) =>
  (
    await buildConfig({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as FrogBotConfig['db'],
      ai: { providers: { anthropic: { apiKey: 'sk-test' } } },
      agents: [{ slug: 'support', model: 'anthropic/claude-sonnet-4-5', instructions: 'Help.' }],
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'leads', admin: { icon: 'people' }, fields: [] },
        { slug: 'pages', admin: { icon: 'file' }, fields: [] },
      ],
      plugins,
    })
  )._internal.payloadConfig;

describe('first-party collection icons', () => {
  it.each(Object.entries(plugins))(
    'plugin-%s gives every sidebar collection it adds an icon',
    async (_name, plugin) => {
      const payloadConfig = await app(plugin);

      expect(collectionsWithoutIcon(payloadConfig.collections)).toEqual([]);
    },
  );
});
