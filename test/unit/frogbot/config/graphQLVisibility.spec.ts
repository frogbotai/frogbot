import { describe, expect, it } from 'vitest';

import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { getPayloadConfig } from '../../../../packages/frogbot/src/exports/internal.js';

const hiddenCollections = [
  'frogbot-chat-turns',
  'frogbot-chat-assets',
  'frogbot-trigger-subscriptions',
  'frogbot-waitpoints',
  'payload-jobs',
  'payload-kv',
  'payload-locked-documents',
  'payload-preferences',
];

const visibleCollections = ['users', 'chats', 'messages', 'files', 'payload-folders'];

async function buildPayloadConfig() {
  const config = await buildConfig({
    secret: 'test-secret',
    db: { defaultIDType: 'number', init: () => ({}) } as unknown as FrogBotConfig['db'],
    typescript: { autoGenerate: false },
    collections: [
      { slug: 'users', auth: true, fields: [{ name: 'name', type: 'text' }] },
      { slug: 'chats', chat: true, fields: [] },
    ],
  });

  return getPayloadConfig(config);
}

describe('GraphQL visibility of built-in collections', () => {
  it('keeps a config without a graphQL key usable with the default GraphQL settings', async () => {
    const payloadConfig = await buildPayloadConfig();

    expect(payloadConfig.graphQL.disable).toBeUndefined();
    expect(payloadConfig.graphQL.queries).toBeUndefined();
    expect(payloadConfig.graphQL.mutations).toBeUndefined();
    expect(payloadConfig.collections.map(({ slug }) => slug)).toContain('users');
  });

  it('hides FrogBot internal collections and hideable built-ins from GraphQL', async () => {
    const payloadConfig = await buildPayloadConfig();
    const hidden = payloadConfig.collections
      .filter((collection) => collection.graphQL === false)
      .map((collection) => collection.slug);

    expect(hidden).toEqual(expect.arrayContaining(hiddenCollections));
  });

  it('keeps public built-in collections in GraphQL', async () => {
    const payloadConfig = await buildPayloadConfig();
    const visible = payloadConfig.collections
      .filter((collection) => collection.graphQL !== false)
      .map((collection) => collection.slug);

    expect(visible).toEqual(expect.arrayContaining(visibleCollections));
  });

  it('hides the jobs stats global from GraphQL', async () => {
    const payloadConfig = await buildPayloadConfig();
    const jobsStats = payloadConfig.globals.find((global) => global.slug === 'payload-jobs-stats');

    expect(jobsStats?.graphQL).toBe(false);
  });
});
