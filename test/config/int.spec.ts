import { describe, it, expect } from 'vitest';
import { mongooseAdapter } from '@frogbotai/db-mongodb';
import { buildConfig } from 'frogbot';
import type { FrogbotConfig } from 'frogbot';

describe('config — buildConfig validation', () => {
  const validBase: FrogbotConfig = {
    secret: 'test-secret',
    db: mongooseAdapter({ url: 'mongodb://localhost:27017/x' }),
    collections: [{ slug: 'users', auth: true, fields: [] }],
  };

  describe('required fields', () => {
    it('missing `secret` is rejected with [frogbot] error', async () => {
      const bad = { ...validBase, secret: '' } as unknown as FrogbotConfig;
      await expect(buildConfig(bad)).rejects.toThrow(/\[frogbot\]/);
    });

    it('missing `db` is rejected', async () => {
      const bad = { ...validBase, db: undefined } as unknown as FrogbotConfig;
      await expect(buildConfig(bad)).rejects.toThrow(/\[frogbot\]/);
    });

    it('non-array `collections` is rejected', async () => {
      const bad = { ...validBase, collections: 'oops' } as unknown as FrogbotConfig;
      await expect(buildConfig(bad)).rejects.toThrow(/\[frogbot\]/);
    });
  });

  describe('forbidden keys', () => {
    it('`globals` is rejected with a descriptive error', async () => {
      const bad = {
        ...validBase,
        globals: [{ slug: 'site', fields: [] }],
      } as unknown as FrogbotConfig;
      await expect(buildConfig(bad)).rejects.toThrow(/\[frogbot\].*globals/i);
    });
  });

  describe('valid configs', () => {
    it('minimal valid config sanitizes without error', async () => {
      const sanitized = await buildConfig(validBase);
      expect(sanitized.collections).toBeDefined();
      expect(sanitized.collections.length).toBeGreaterThan(0);
    });

    it('missing optional fields (admin) do not fail validation', async () => {
      const config: FrogbotConfig = { ...validBase };
      const sanitized = await buildConfig(config);
      expect(sanitized).toBeDefined();
    });
  });
});
