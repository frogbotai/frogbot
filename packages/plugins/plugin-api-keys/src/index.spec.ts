import { describe, expect, expectTypeOf, it } from 'vitest';

import type { FrogbotConfig, Plugin } from 'frogbot';
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
});
