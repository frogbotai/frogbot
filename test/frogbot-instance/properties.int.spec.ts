import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('frogbot-instance: Properties', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => { booted = await bootFrogbot(dirname); });
  afterAll(async () => { await booted.shutdown(); });

  describe('config', () => {
    it('is a SanitizedConfig with collections array', () => {
      const { config } = booted.frogbot;

      expect(config).toBeDefined();
      expect(Array.isArray(config.collections)).toBe(true);
      expect(config.collections.length).toBeGreaterThan(0);
    });

    it('contains the expected collection slugs', () => {
      const slugs = booted.frogbot.config.collections.map((c) => c.slug);

      expect(slugs).toContain('posts');
      expect(slugs).toContain('users');
    });
  });

  describe('db', () => {
    it('has expected adapter methods', () => {
      const { db } = booted.frogbot;

      expect(db).toBeDefined();
      expect(typeof db.find).toBe('function');
      expect(typeof db.create).toBe('function');
      expect(typeof db.updateOne).toBe('function');
      expect(typeof db.deleteOne).toBe('function');
    });
  });

  describe('secret', () => {
    it('is the string from config', () => {
      const { secret } = booted.frogbot;

      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('logger', () => {
    it('exposes info, warn, error, debug log functions', () => {
      const { logger } = booted.frogbot;

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('kv', () => {
    it('is defined', () => {
      expect(booted.frogbot.kv).toBeDefined();
    });
  });

  describe('email', () => {
    it('sendEmail is callable', () => {
      expect(booted.frogbot.email).toBeDefined();
      expect(typeof booted.frogbot.email.sendEmail).toBe('function');
    });
  });
});
