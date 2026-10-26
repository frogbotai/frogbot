import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { AgentConfig } from '../../../../packages/frogbot/src/agents/types.js';
import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { autonumberField } from '../../../../packages/frogbot/src/fields/baseFields/autonumber/index.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { apiKeysPlugin } from '../../../../packages/plugins/plugin-api-keys/src/index.js';
import { auditLogPlugin } from '../../../../packages/plugins/plugin-audit-log/src/index.js';
import { capturePlugin } from '../../../../packages/plugins/plugin-capture/src/index.js';
import { importExportPlugin } from '../../../../packages/plugins/plugin-import-export/src/index.js';
import { nestedDocsPlugin } from '../../../../packages/plugins/plugin-nested-docs/src/index.js';
import { redirectsPlugin } from '../../../../packages/plugins/plugin-redirects/src/index.js';
import { rolesPlugin } from '../../../../packages/plugins/plugin-roles/src/index.js';
import { seoPlugin } from '../../../../packages/plugins/plugin-seo/src/index.js';
import { usageReportsPlugin } from '../../../../packages/plugins/plugin-usage-reports/src/index.js';

const CASCADED = ['api-keys.owner', 'connections.owner', 'messages.chat'];

const agent = {
  slug: 'support',
  model: 'openai/gpt-5.4-mini',
  instructions: 'Help the user',
} satisfies AgentConfig;

const createExample = definePiece({
  slug: 'example',
  label: 'Example',
  auth: z.object({ apiKey: z.string().min(1) }),
  client: ({ auth }: { auth: unknown }) => auth,
  actions: [],
  webhook: { verify: () => Promise.resolve(true), parse: () => ({ event: 'created' }) },
  triggers: [
    {
      slug: 'created',
      type: 'app',
      event: 'created',
      description: 'Created',
      input: z.object({}),
      run: () => Promise.resolve([]),
    },
  ],
});

type ConfigField = {
  name?: string;
  type: string;
  required?: boolean;
  admin?: { condition?: unknown };
  fields?: ConfigField[];
  tabs?: { name?: string; fields: ConfigField[] }[];
  blocks?: { slug: string; fields: ConfigField[] }[];
};

function requiredRelationships(fields: ConfigField[], prefix: string): string[] {
  return fields.flatMap((field) => {
    if (field.admin?.condition) return [];

    const path = field.name ? `${prefix}.${field.name}` : prefix;

    if ((field.type === 'relationship' || field.type === 'upload') && field.required) {
      return [path];
    }

    return [
      ...requiredRelationships(field.fields ?? [], path),
      ...(field.tabs ?? []).flatMap((tab) =>
        requiredRelationships(tab.fields, tab.name ? `${path}.${tab.name}` : path),
      ),
      ...(field.blocks ?? []).flatMap((block) =>
        requiredRelationships(block.fields, `${path}.${block.slug}`),
      ),
    ];
  });
}

describe('required relationships', () => {
  it('lists only the relationships whose parent delete cascades', async () => {
    const example = createExample({});
    const config = await buildConfig({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as FrogBotConfig['db'],
      ai: { providers: { openai: { apiKey: 'sk-test' } } },
      agents: [{ ...agent, triggers: [{ trigger: example.triggers.created, handler: vi.fn() }] }],
      connections: [{ piece: example, secret: true }],
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'chats', chat: true, fields: [] },
        { slug: 'pages', fields: [{ name: 'title', type: 'text' }] },
        { slug: 'tickets', fields: [autonumberField({ name: 'number' })] },
      ],
      plugins: [
        rolesPlugin(),
        apiKeysPlugin(),
        auditLogPlugin(),
        capturePlugin(),
        usageReportsPlugin(),
        importExportPlugin({ collections: [{ slug: 'pages' }] }),
        nestedDocsPlugin({ collections: ['pages'] }),
        redirectsPlugin({ collections: ['pages'] }),
        seoPlugin({ collections: ['pages'] }),
      ],
    });

    const payloadConfig = await config._internal.payloadConfig;
    const found = payloadConfig.collections
      .filter(({ slug }) => !slug.startsWith('payload-'))
      .flatMap(({ fields, slug }) => requiredRelationships(fields as ConfigField[], slug));

    expect(found.sort()).toEqual(CASCADED);
  });
});
