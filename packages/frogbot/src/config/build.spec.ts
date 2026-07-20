import { describe, expect, it, vi } from 'vitest';

import type { FrogbotConfig } from '../types/config.js';
import type { CollectionConfig } from '../types/collection.js';
import type { Plugin } from '../types/plugin.js';

vi.mock('payload', () => ({
  buildConfig: vi.fn((config: unknown) => Promise.resolve(config)),
  handleEndpoints: vi.fn(),
}));

vi.mock('../getFrogbot.js', () => ({
  getCachedFrogbot: vi.fn(() => null),
}));

const { buildConfig } = await import('./build.js');

function makeConfig(overrides?: Partial<FrogbotConfig>): FrogbotConfig {
  return {
    secret: 'test-secret',
    db: {} as FrogbotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [{ name: 'name', type: 'text' }] }],
    ...overrides,
  };
}

describe('frogbot buildConfig', () => {
  describe('validation', () => {
    it('rejects a missing `secret`', async () => {
      const config = makeConfig({ secret: '' });
      await expect(buildConfig(config)).rejects.toThrowError('[frogbot] `secret` is required and must be a string.');
    });

    it('rejects a non-string `secret`', async () => {
      const config = makeConfig({ secret: 123 as unknown as string });
      await expect(buildConfig(config)).rejects.toThrowError('[frogbot] `secret` is required and must be a string.');
    });

    it('rejects a missing `db`', async () => {
      const config = makeConfig({
        db: undefined as unknown as FrogbotConfig['db'],
      });
      await expect(buildConfig(config)).rejects.toThrowError('[frogbot] `db` is required. Pass a database adapter.');
    });

    it('rejects a non-array `collections`', async () => {
      const config = makeConfig({
        collections: 'nope' as unknown as CollectionConfig[],
      });
      await expect(buildConfig(config)).rejects.toThrowError(
        '[frogbot] `collections` is required and must be an array.',
      );
    });

    it('rejects a `globals` key with a `[frogbot]` error', async () => {
      const config = makeConfig() as unknown as Record<string, unknown>;
      config.globals = [{ slug: 'site', fields: [] }];
      await expect(buildConfig(config as unknown as FrogbotConfig)).rejects.toThrowError(
        '[frogbot] `globals` is not a FrogBot concept',
      );
    });
  });

  describe('plugin pipeline', () => {
    it('runs plugins serially in array order, feeding each the previous output', async () => {
      const order: number[] = [];
      const plugin1: Plugin = (c) => {
        order.push(1);
        return { ...c, secret: c.secret + '-1' };
      };
      const plugin2: Plugin = (c) => {
        order.push(2);
        expect(c.secret).toBe('test-secret-1');
        return { ...c, secret: c.secret + '-2' };
      };
      const config = makeConfig({ plugins: [plugin1, plugin2] });
      await buildConfig(config);
      expect(order).toEqual([1, 2]);
    });

    it('supports async plugins', async () => {
      const asyncPlugin: Plugin = async (c) => {
        await new Promise((r) => setTimeout(r, 1));
        return {
          ...c,
          collections: [...c.collections, { slug: 'added', fields: [] }],
        };
      };
      const config = makeConfig({ plugins: [asyncPlugin] });
      const result = await buildConfig(config);
      const slugs = result.collections.map((c) => c.slug);
      expect(slugs).toContain('added');
    });

    it('surfaces a plugin failure as `[frogbot] plugin at index N failed: <msg>`', async () => {
      const config = makeConfig({
        plugins: [
          () => {
            throw new Error('plugin boom');
          },
        ],
      });
      await expect(buildConfig(config)).rejects.toThrowError('[frogbot] plugin at index 0 failed: plugin boom');
    });

    it('wraps the correct index for non-first plugin failures', async () => {
      const config = makeConfig({
        plugins: [
          (c) => c,
          (c) => c,
          () => {
            throw new Error('third died');
          },
        ],
      });
      await expect(buildConfig(config)).rejects.toThrowError('[frogbot] plugin at index 2 failed: third died');
    });

    it('plugin can add fields to a collection', async () => {
      const addField: Plugin = (c) => ({
        ...c,
        collections: c.collections.map((col) =>
          col.slug === 'users'
            ? {
                ...col,
                fields: [...col.fields, { name: 'createdBy', type: 'text' as const }],
              }
            : col,
        ),
      });
      const config = makeConfig({ plugins: [addField] });
      const result = await buildConfig(config);
      // Result is now FrogbotSanitizedConfig — check via _internal.payloadConfig
      const payloadConfig = await result._internal.payloadConfig;
      const users = (payloadConfig as any).collections.find((c: any) => c.slug === 'users');
      const fieldNames = users.fields.map((f: any) => f.name);
      expect(fieldNames).toContain('createdBy');
    });

    it('plugin can add new collections', async () => {
      const addCollection: Plugin = (c) => ({
        ...c,
        collections: [
          ...c.collections,
          {
            slug: 'audits',
            fields: [{ name: 'action', type: 'text' as const }],
          },
        ],
      });
      const config = makeConfig({ plugins: [addCollection] });
      const result = await buildConfig(config);
      const slugs = result.collections.map((c) => c.slug);
      expect(slugs).toContain('audits');
    });
  });

  describe('sanitization passthrough', () => {
    it('builds a minimal valid config and returns a FrogbotSanitizedConfig', async () => {
      const config = makeConfig();
      const result = await buildConfig(config);
      expect(result).toBeDefined();
      expect(result.collections).toBeDefined();
      expect(result._internal.payloadConfig).toBeInstanceOf(Promise);
    });

    it('FrogBot `plugins` key is not present in payload config', async () => {
      const config = makeConfig({ plugins: [(c) => c] });
      const result = await buildConfig(config);
      const payloadConfig = await result._internal.payloadConfig;
      expect((payloadConfig as any).plugins).toBeUndefined();
    });

    it('every user collection has a `beforeOperation` hook prepended in payload config', async () => {
      const config = makeConfig({
        collections: [
          { slug: 'users', auth: true, fields: [] },
          { slug: 'projects', fields: [] },
          { slug: 'files', fields: [] },
        ],
      });
      const result = await buildConfig(config);
      const payloadConfig = await result._internal.payloadConfig;
      for (const col of (payloadConfig as any).collections) {
        expect(col.hooks?.beforeOperation?.length).toBeGreaterThan(0);
      }
    });

    it('users collection survives sanitize with auth intact', async () => {
      const config = makeConfig();
      const result = await buildConfig(config);
      const payloadConfig = await result._internal.payloadConfig;
      const users = (payloadConfig as any).collections.find((c: any) => c.slug === 'users');
      expect(users.auth).toBeTruthy();
    });

    it('does not mutate the caller\u2019s input config object', async () => {
      const collections: CollectionConfig[] = [
        {
          slug: 'projects',
          fields: [{ name: 'title', type: 'text' }],
        },
        { slug: 'users', auth: true, fields: [] },
      ];
      const config = makeConfig({ collections });
      const snapshot = JSON.stringify(config);
      await buildConfig(config);
      expect(JSON.stringify(config)).toBe(snapshot);
    });
  });

  describe('edge cases', () => {
    it('works with zero plugins', async () => {
      const config = makeConfig({ plugins: [] });
      const result = await buildConfig(config);
      expect(result).toBeDefined();
    });

    it('works with no plugins key', async () => {
      const config = makeConfig();
      delete (config as any).plugins;
      const result = await buildConfig(config);
      expect(result).toBeDefined();
    });

    it('handles empty collections array', async () => {
      const config = makeConfig({ collections: [] });
      const result = await buildConfig(config);
      expect(result.collections).toEqual([]);
    });
  });
});
