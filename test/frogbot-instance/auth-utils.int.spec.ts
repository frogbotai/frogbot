import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { testUserEmail, testUserPassword, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('frogbot-instance: Auth + utilities', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => {
    booted = await bootFrogbot(dirname);

    await booted.frogbot.create({
      collection: usersSlug,
      data: { email: testUserEmail, password: testUserPassword, name: 'Test User' },
      overrideAccess: true,
    });
  });
  afterAll(async () => { await booted.shutdown(); });

  describe('auth', () => {
    it('with valid JWT headers returns user and permissions', async () => {
      const loginResult = await booted.frogbot.login({
        collection: usersSlug,
        data: { email: testUserEmail, password: testUserPassword },
      });

      const headers = new Headers();
      headers.set('Authorization', `JWT ${loginResult.token}`);

      const authResult = await booted.frogbot.auth({ headers });

      expect(authResult.user).not.toBeNull();
      expect(authResult).toHaveProperty('permissions');
      expect(typeof authResult.permissions).toBe('object');
    });

    it('with no headers returns user as null', async () => {
      const headers = new Headers();

      const authResult = await booted.frogbot.auth({ headers });

      expect(authResult.user).toBeNull();
    });

    it('with invalid token returns user as null', async () => {
      const headers = new Headers();
      headers.set('Authorization', 'JWT invalid.token.here');

      const authResult = await booted.frogbot.auth({ headers });

      expect(authResult.user).toBeNull();
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trips a string', () => {
      const original = 'sensitive-data-12345';
      const encrypted = booted.frogbot.encrypt(original);

      expect(encrypted).not.toEqual(original);

      const decrypted = booted.frogbot.decrypt(encrypted);
      expect(decrypted).toEqual(original);
    });

    it('produces different ciphertext for different inputs', () => {
      const a = booted.frogbot.encrypt('alpha');
      const b = booted.frogbot.encrypt('beta');

      expect(a).not.toEqual(b);
    });
  });

  describe('getAdminURL', () => {
    it('returns a string containing the server URL', () => {
      const url = booted.frogbot.getAdminURL();

      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
    });
  });

  describe('getAPIURL', () => {
    it('returns a string ending with /api', () => {
      const url = booted.frogbot.getAPIURL();

      expect(typeof url).toBe('string');
      expect(url).toMatch(/\/api$/);
    });
  });

  describe('destroy', () => {
    it('resolves without error', async () => {
      await expect(booted.frogbot.destroy()).resolves.toBeUndefined();
    });
  });
});
