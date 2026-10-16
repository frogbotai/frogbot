import type * as PayloadModule from 'payload';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { AgentConfig } from '../../../../packages/frogbot/src/agents/types.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { autonumberField } from '../../../../packages/frogbot/src/fields/baseFields/autonumber/index.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { apiKeysPlugin } from '../../../../packages/plugins/plugin-api-keys/src/index.js';
import { auditLogPlugin } from '../../../../packages/plugins/plugin-audit-log/src/index.js';
import { capturePlugin } from '../../../../packages/plugins/plugin-capture/src/index.js';

const { incoming } = vi.hoisted(() => ({
  incoming: [] as { slug: string; versions: unknown; hasVersions: boolean }[][],
}));

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof PayloadModule>();

  return {
    ...actual,
    buildConfig: vi.fn((config: PayloadModule.Config) => {
      incoming.push(
        (config.collections ?? []).map(({ slug, versions }) => ({
          slug,
          versions: structuredClone(versions),
          hasVersions: versions !== undefined,
        })),
      );

      return actual.buildConfig(config);
    }),
  };
});

vi.mock('../../../../packages/frogbot/src/getFrogBot.js', () => ({
  getCachedFrogBot: vi.fn(() => null),
  seedFrogBotCache: vi.fn(),
}));

const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');

const INTERNAL = [
  'chats',
  'messages',
  'frogbot-chat-assets',
  'frogbot-chat-turns',
  'frogbot-autonumbers',
  'frogbot-waitpoints',
  'frogbot-trigger-subscriptions',
  'usage-logs',
  'connections',
  'api-keys',
  'audit-logs',
  'ai-captures',
];

const ai = { providers: { openai: { apiKey: 'sk-test' } } };
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

function config(overrides: Partial<FrogBotConfig> = {}): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: {} as FrogBotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }],
    ...overrides,
  };
}

async function build(input: FrogBotConfig) {
  incoming.length = 0;
  const sanitized = await buildConfig(input);
  const payload = await sanitized._internal.payloadConfig;
  const before = new Map(incoming.at(-1)?.map((entry) => [entry.slug, entry]));
  const after = new Map(payload.collections.map((collection) => [collection.slug, collection]));

  return { before, after };
}

function everything(collections: FrogBotConfig['collections']): FrogBotConfig {
  const example = createExample({});

  return config({
    ai,
    agents: [{ ...agent, triggers: [{ trigger: example.triggers.created, handler: vi.fn() }] }],
    connections: [{ piece: example, secret: true }],
    collections: [
      ...collections,
      { slug: 'tickets', fields: [autonumberField({ name: 'number' })] },
    ],
    plugins: [apiKeysPlugin(), auditLogPlugin(), capturePlugin()],
  });
}

describe('collection versions', () => {
  it('turns versions off on every FrogBot collection and leaves no key after Payload sanitizes', async () => {
    const { before, after } = await build(everything([{ slug: 'users', auth: true, fields: [] }]));

    for (const slug of [...INTERNAL, 'users']) {
      expect(before.get(slug), slug).toMatchObject({ versions: false });
      expect(after.get(slug), slug).not.toHaveProperty('versions');
    }
  });

  it.each([
    ['with AI', config({ ai, collections: [] })],
    ['without AI', config({ collections: [] })],
  ])('turns versions off on the fallback users collection %s', async (_label, input) => {
    const { before, after } = await build(input);

    expect(before.get('users')).toMatchObject({ versions: false });
    expect(after.get('users')).not.toHaveProperty('versions');
  });

  it('leaves collections without auth on Payload default', async () => {
    const { before } = await build(
      config({ collections: [...config().collections, { slug: 'posts', fields: [] }] }),
    );

    expect(before.get('posts')).toMatchObject({ hasVersions: false });
  });

  it.each([true, { drafts: true }] as const)(
    'keeps versions: %j on an app auth collection',
    async (versions) => {
      const { before, after } = await build(
        config({
          collections: [
            { slug: 'users', auth: true, versions: structuredClone(versions), fields: [] },
          ],
        }),
      );

      expect(before.get('users')).toMatchObject({ versions });
      expect(after.get('users')?.versions).toMatchObject(
        versions === true ? { drafts: false } : { drafts: expect.objectContaining({}) },
      );
    },
  );

  it('keeps the versions of a marked chats collection', async () => {
    const { before, after } = await build(
      everything([
        { slug: 'users', auth: true, fields: [] },
        { slug: 'conversations', chat: true, versions: { drafts: true }, fields: [] },
      ]),
    );

    expect(before.get('conversations')).toMatchObject({ versions: { drafts: true } });
    expect(after.get('conversations')?.versions).toMatchObject({
      drafts: expect.objectContaining({}),
    });
  });
});
