import { describe, it, expect } from 'vitest';
import { mongooseAdapter } from '@frogbotai/db-mongodb';
import { buildConfig } from 'frogbot';
import type { FrogbotConfig, FrogbotPlugin } from 'frogbot';

import { projectsSlug } from './shared.js';

describe('plugins', () => {
  describe('lifecycle', () => {
    it('plugins run serially in array order', async () => {
      const order: number[] = [];
      const plugin1: FrogbotPlugin = (config) => { order.push(1); return config; };
      const plugin2: FrogbotPlugin = (config) => { order.push(2); return config; };

      const testConfig: FrogbotConfig = {
        secret: 'serial-test',
        db: mongooseAdapter({ url: 'mongodb://localhost:27017/x' }),
        collections: [{ slug: 'users', auth: true, fields: [] }],
        plugins: [plugin1, plugin2],
      };
      await buildConfig(testConfig);
      expect(order).toEqual([1, 2]);
    });

    it('plugin can register a new collection', async () => {
      const addCollection: FrogbotPlugin = (config) => ({
        ...config,
        collections: [
          ...config.collections,
          { slug: 'notes', fields: [{ name: 'body', type: 'textarea' }] },
        ],
      });

      const testConfig: FrogbotConfig = {
        secret: 'register-collection-test',
        db: mongooseAdapter({ url: 'mongodb://localhost:27017/x' }),
        collections: [{ slug: 'users', auth: true, fields: [] }],
        plugins: [addCollection],
      };
      const sanitized = await buildConfig(testConfig);
      const notes = sanitized.collections.find((c) => c.slug === 'notes');
      expect(notes).toBeDefined();
    });

    it('plugin can mutate existing collection fields', async () => {
      const stampCreatedBy: FrogbotPlugin = (config) => ({
        ...config,
        collections: config.collections.map((c) =>
          c.slug === projectsSlug
            ? { ...c, fields: [...c.fields, { name: 'createdBy', type: 'text' as const }] }
            : c,
        ),
      });

      const testConfig: FrogbotConfig = {
        secret: 'mutate-fields-test',
        db: mongooseAdapter({ url: 'mongodb://localhost:27017/x' }),
        collections: [
          { slug: 'users', auth: true, fields: [] },
          { slug: projectsSlug, fields: [{ name: 'title', type: 'text' }] },
        ],
        plugins: [stampCreatedBy],
      };
      const sanitized = await buildConfig(testConfig);
      const projects = sanitized.collections.find((c) => c.slug === projectsSlug);
      const hasCreatedBy = (projects?.fields ?? []).some(
        (f) => (f as { name?: string }).name === 'createdBy',
      );
      expect(hasCreatedBy).toBe(true);
    });
  });

  describe('error handling', () => {
    it('plugin error is wrapped with index', async () => {
      const boom: FrogbotConfig = {
        secret: 'x',
        db: mongooseAdapter({ url: 'mongodb://localhost:27017/x' }),
        collections: [{ slug: 'users', auth: true, fields: [] }],
        plugins: [() => { throw new Error('plugin boom'); }],
      };

      await expect(buildConfig(boom)).rejects.toThrow(/\[frogbot\] plugin at index 0/);
    });

    it('empty plugins array boots cleanly', async () => {
      const testConfig: FrogbotConfig = {
        secret: 'empty-plugins',
        db: mongooseAdapter({ url: 'mongodb://localhost:27017/x' }),
        collections: [{ slug: 'users', auth: true, fields: [] }],
        plugins: [],
      };
      const sanitized = await buildConfig(testConfig);
      expect(sanitized.collections).toBeDefined();
    });
  });
});
