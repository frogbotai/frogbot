import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { usersSlug, testUserEmail, testUserPassword } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('auth', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => { booted = await bootFrogbot(dirname); });
  afterAll(async () => { await booted.shutdown(); });
  beforeEach(async () => { await clearAndSeed(booted.frogbot, 'empty'); });

  async function createUser(email = testUserEmail, password = testUserPassword) {
    return booted.restClient.post(`/api/${usersSlug}`, { email, password, name: 'Test' });
  }

  describe('registration + login', () => {
    it('POST /api/users creates a user and returns a token', async () => {
      const res = await createUser();
      expect(res.status).toBe(201);
      expect((res.body as any).doc.email).toBe(testUserEmail);
    });

    it('POST /api/users/login returns a token for valid credentials', async () => {
      await createUser();
      const res = await booted.restClient.post(`/api/${usersSlug}/login`, {
        email: testUserEmail,
        password: testUserPassword,
      });
      expect(res.status).toBe(200);
      expect((res.body as any).token).toBeDefined();
    });

    it('POST /api/users/login rejects invalid credentials', async () => {
      await createUser();
      const res = await booted.restClient.post(`/api/${usersSlug}/login`, {
        email: testUserEmail,
        password: 'wrong-password',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('token authentication', () => {
    it('authenticated request succeeds with valid token', async () => {
      await createUser();
      const login = await booted.restClient.post(`/api/${usersSlug}/login`, {
        email: testUserEmail,
        password: testUserPassword,
      });
      const token = (login.body as any).token;

      const res = await booted.restClient.get(`/api/${usersSlug}/me`, {
        headers: { Authorization: `JWT ${token}` },
      });
      expect(res.status).toBe(200);
      expect((res.body as any).user.email).toBe(testUserEmail);
    });

    it('unauthenticated request to /me returns null user', async () => {
      const res = await booted.restClient.get(`/api/${usersSlug}/me`);
      expect(res.status).toBe(200);
      expect((res.body as any).user).toBeNull();
    });
  });
});
