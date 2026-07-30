import type { FrogbotConfig, Plugin } from 'frogbot';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { apiKeysPlugin } from './index.js';

describe('apiKeysPlugin', () => {
  it('provides a Frogbot plugin with zero configuration', async () => {
    const plugin = apiKeysPlugin();
    expectTypeOf(plugin).toMatchTypeOf<Plugin>();
    const config = {
      secret: 'test',
      db: {},
      collections: [{ slug: 'users', auth: true, fields: [] }],
    } as FrogbotConfig;
    const result = await plugin(config);
    expect(result.collections.map((collection) => collection.slug)).toEqual(['users', 'api-keys']);
    expect(result.collections[0]?.auth).toMatchObject({ strategies: [{ name: 'api-key' }] });
  });

  it('appends to existing authentication strategies', async () => {
    const existing = { name: 'existing', authenticate: () => ({ user: null }) };
    const config = {
      secret: 'test',
      db: {},
      collections: [{ slug: 'users', auth: { strategies: [existing] }, fields: [] }],
    } as FrogbotConfig;
    const result = await apiKeysPlugin()(config);
    const users = result.collections[0];
    expect(typeof users?.auth === 'object' && users.auth.strategies?.map((strategy) => strategy.name)).toEqual([
      'existing',
      'api-key',
    ]);
  });

  it('composes API key attribution into AI usage tracking', async () => {
    const existingHook = () => undefined;
    const config = {
      secret: 'test',
      db: {},
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'ai-usage', usageLog: true, fields: [{ name: 'team', type: 'text' }] },
      ],
      ai: {
        providers: { openai: { apiKey: 'test' } },
        hooks: { beforeOperation: [existingHook] },
      },
    } as FrogbotConfig;
    const result = await apiKeysPlugin({ collectionSlug: 'credentials' })(config);
    const marked = result.collections.filter((collection) => collection.usageLog === true);
    const field = marked[0]?.fields.find((item) => 'name' in item && item.name === 'apiKey');
    const hooks = result.ai?.hooks?.beforeOperation ?? [];
    const context: Record<string, unknown> = {};

    await hooks.at(-1)?.({ req: { user: { apiKeyId: 'key-9' } }, context } as never);

    expect(hooks[0]).toBe(existingHook);
    expect(context.usageFields).toEqual({ apiKey: 'key-9' });
    expect(marked).toHaveLength(1);
    expect(field).toMatchObject({
      type: 'relationship',
      relationTo: 'credentials',
      index: true,
    });
    expect(marked[0]?.fields).toContainEqual(expect.objectContaining({ name: 'team' }));
  });

  it('adds no usage attribution surfaces without AI', async () => {
    const config = {
      secret: 'test',
      db: {},
      collections: [{ slug: 'users', auth: true, fields: [] }],
    } as FrogbotConfig;
    const result = await apiKeysPlugin()(config);

    expect(result.collections.some((collection) => collection.usageLog === true)).toBe(false);
    expect(result.ai).toBeUndefined();
  });
});
