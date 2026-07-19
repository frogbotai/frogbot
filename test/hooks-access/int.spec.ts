import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import {
  hookOrderSlug,
  reqAccessSlug,
  accessBooleanSlug,
  accessWhereSlug,
  fieldAccessSlug,
  validateSlug,
  afterOpSlug,
  contextFlowSlug,
  overrideAccessSlug,
  usersSlug,
  testUserEmail,
  testUserPassword,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

let booted: BootedFrogbot;
let clearHookLog: () => void;
let getHookLog: () => string[];

describe('hooks-access', () => {
  beforeAll(async () => {
    booted = await bootFrogbot(dirname);

    // Import the hook log from the config module (same instance the hooks write to)
    const configMod = await import('./config.js');
    clearHookLog = configMod.clearHookLog;
    getHookLog = () => configMod.hookLog;
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    clearHookLog();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Hook lifecycle ordering
  // ═══════════════════════════════════════════════════════════════════════════

  describe('hook lifecycle ordering', () => {
    it('create fires: beforeValidate -> beforeChange -> afterChange', async () => {
      await booted.frogbot.create({
        collection: hookOrderSlug,
        data: { title: 'test' },
        overrideAccess: true,
      });

      const log = getHookLog();
      expect(log).toContain('beforeValidate');
      expect(log).toContain('beforeChange');
      expect(log).toContain('afterChange');
      expect(log.indexOf('beforeValidate')).toBeLessThan(log.indexOf('beforeChange'));
      expect(log.indexOf('beforeChange')).toBeLessThan(log.indexOf('afterChange'));
    });

    it('find fires: beforeRead -> afterRead', async () => {
      await booted.frogbot.create({
        collection: hookOrderSlug,
        data: { title: 'test' },
        overrideAccess: true,
      });
      clearHookLog();

      await booted.frogbot.find({
        collection: hookOrderSlug,
        overrideAccess: true,
      });

      const log = getHookLog();
      expect(log).toContain('beforeRead');
      expect(log).toContain('afterRead');
      expect(log.indexOf('beforeRead')).toBeLessThan(log.indexOf('afterRead'));
    });

    it('findByID fires: beforeRead -> afterRead', async () => {
      const doc = await booted.frogbot.create({
        collection: hookOrderSlug,
        data: { title: 'test' },
        overrideAccess: true,
      });
      clearHookLog();

      await booted.frogbot.findByID({
        collection: hookOrderSlug,
        id: doc.id,
        overrideAccess: true,
      });

      const log = getHookLog();
      expect(log).toContain('beforeRead');
      expect(log).toContain('afterRead');
    });

    it('update fires: beforeValidate -> beforeChange -> afterChange', async () => {
      const doc = await booted.frogbot.create({
        collection: hookOrderSlug,
        data: { title: 'test' },
        overrideAccess: true,
      });
      clearHookLog();

      await booted.frogbot.update({
        collection: hookOrderSlug,
        id: doc.id,
        data: { title: 'updated' },
        overrideAccess: true,
      });

      const log = getHookLog();
      expect(log).toContain('beforeValidate');
      expect(log).toContain('beforeChange');
      expect(log).toContain('afterChange');
      expect(log.indexOf('beforeValidate')).toBeLessThan(log.indexOf('beforeChange'));
      expect(log.indexOf('beforeChange')).toBeLessThan(log.indexOf('afterChange'));
    });

    it('delete fires: beforeDelete -> afterDelete', async () => {
      const doc = await booted.frogbot.create({
        collection: hookOrderSlug,
        data: { title: 'test' },
        overrideAccess: true,
      });
      clearHookLog();

      await booted.frogbot.delete({
        collection: hookOrderSlug,
        id: doc.id,
        overrideAccess: true,
      });

      const log = getHookLog();
      expect(log).toContain('beforeDelete');
      expect(log).toContain('afterDelete');
      expect(log.indexOf('beforeDelete')).toBeLessThan(log.indexOf('afterDelete'));
    });

    it('no read hooks fire on create/update/delete', async () => {
      const doc = await booted.frogbot.create({
        collection: hookOrderSlug,
        data: { title: 'test' },
        overrideAccess: true,
      });

      // Check create log - no beforeRead
      let log = getHookLog();
      expect(log).not.toContain('beforeRead');

      clearHookLog();
      await booted.frogbot.update({
        collection: hookOrderSlug,
        id: doc.id,
        data: { title: 'updated' },
        overrideAccess: true,
      });

      log = getHookLog();
      expect(log).not.toContain('beforeRead');

      clearHookLog();
      await booted.frogbot.delete({
        collection: hookOrderSlug,
        id: doc.id,
        overrideAccess: true,
      });

      log = getHookLog();
      expect(log).not.toContain('beforeRead');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // req.frogbot in hooks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('req.frogbot in hooks', () => {
    it('beforeChange can call req.frogbot.find() and get results', async () => {
      // Seed one doc first so the hook's find() returns count > 0
      await booted.frogbot.create({
        collection: reqAccessSlug,
        data: { title: 'seed' },
        overrideAccess: true,
      });

      // Create another - the beforeChange hook calls find() and stores totalDocs
      const doc = await booted.frogbot.create({
        collection: reqAccessSlug,
        data: { title: 'second' },
        overrideAccess: true,
      });

      // The afterChange hook writes hookCount via req.frogbot.update()
      const fetched = await booted.frogbot.findByID({
        collection: reqAccessSlug,
        id: doc.id,
        overrideAccess: true,
      });

      // At the time of beforeChange, there was 1 doc (the seed)
      expect(fetched.hookCount).toBe(1);
    });

    it('hookCount field is populated by the hook (proves req.frogbot worked)', async () => {
      const doc = await booted.frogbot.create({
        collection: reqAccessSlug,
        data: { title: 'first' },
        overrideAccess: true,
      });

      const fetched = await booted.frogbot.findByID({
        collection: reqAccessSlug,
        id: doc.id,
        overrideAccess: true,
      });

      // When creating the first doc, find() returns 0 totalDocs
      expect(fetched.hookCount).toBe(0);
    });

    it('afterChange can call req.frogbot.update() on the same doc', async () => {
      // Create two docs; the second should have hookCount = 1
      await booted.frogbot.create({
        collection: reqAccessSlug,
        data: { title: 'A' },
        overrideAccess: true,
      });

      const docB = await booted.frogbot.create({
        collection: reqAccessSlug,
        data: { title: 'B' },
        overrideAccess: true,
      });

      const fetched = await booted.frogbot.findByID({
        collection: reqAccessSlug,
        id: docB.id,
        overrideAccess: true,
      });

      expect(fetched.hookCount).toBe(1);
    });

    it('multiple creates increment hookCount correctly', async () => {
      await booted.frogbot.create({ collection: reqAccessSlug, data: { title: 'A' }, overrideAccess: true });
      await booted.frogbot.create({ collection: reqAccessSlug, data: { title: 'B' }, overrideAccess: true });
      const docC = await booted.frogbot.create({ collection: reqAccessSlug, data: { title: 'C' }, overrideAccess: true });

      const fetched = await booted.frogbot.findByID({
        collection: reqAccessSlug,
        id: docC.id,
        overrideAccess: true,
      });

      // At time of C's beforeChange, A and B exist
      expect(fetched.hookCount).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Collection access — boolean
  // ═══════════════════════════════════════════════════════════════════════════

  describe('collection access — boolean', () => {
    it('can create a doc (access.create = true)', async () => {
      const doc = await booted.frogbot.create({
        collection: accessBooleanSlug,
        data: { title: 'allowed' },
        overrideAccess: false,
      });
      expect(doc.id).toBeDefined();
      expect(doc.title).toBe('allowed');
    });

    it('can read the doc (access.read = true)', async () => {
      const doc = await booted.frogbot.create({
        collection: accessBooleanSlug,
        data: { title: 'readable' },
        overrideAccess: false,
      });

      const found = await booted.frogbot.findByID({
        collection: accessBooleanSlug,
        id: doc.id,
        overrideAccess: false,
      });
      expect(found.title).toBe('readable');
    });

    it('cannot update without overrideAccess (access.update = false)', async () => {
      const doc = await booted.frogbot.create({
        collection: accessBooleanSlug,
        data: { title: 'locked' },
        overrideAccess: true,
      });

      await expect(
        booted.frogbot.update({
          collection: accessBooleanSlug,
          id: doc.id,
          data: { title: 'attempt' },
          overrideAccess: false,
        }),
      ).rejects.toThrow();
    });

    it('cannot delete without overrideAccess (access.delete = false)', async () => {
      const doc = await booted.frogbot.create({
        collection: accessBooleanSlug,
        data: { title: 'locked' },
        overrideAccess: true,
      });

      await expect(
        booted.frogbot.delete({
          collection: accessBooleanSlug,
          id: doc.id,
          overrideAccess: false,
        }),
      ).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Collection access — where clause
  // ═══════════════════════════════════════════════════════════════════════════

  describe('collection access — where clause', () => {
    it('can read docs where hidden=false', async () => {
      const doc = await booted.frogbot.create({
        collection: accessWhereSlug,
        data: { title: 'visible', hidden: false },
        overrideAccess: true,
      });

      const found = await booted.frogbot.findByID({
        collection: accessWhereSlug,
        id: doc.id,
        overrideAccess: false,
      });
      expect(found.title).toBe('visible');
    });

    it('cannot read docs where hidden=true (filtered out)', async () => {
      const doc = await booted.frogbot.create({
        collection: accessWhereSlug,
        data: { title: 'secret', hidden: true },
        overrideAccess: true,
      });

      await expect(
        booted.frogbot.findByID({
          collection: accessWhereSlug,
          id: doc.id,
          overrideAccess: false,
        }),
      ).rejects.toThrow();
    });

    it('find returns only non-hidden docs', async () => {
      await booted.frogbot.create({
        collection: accessWhereSlug,
        data: { title: 'visible1', hidden: false },
        overrideAccess: true,
      });
      await booted.frogbot.create({
        collection: accessWhereSlug,
        data: { title: 'visible2', hidden: false },
        overrideAccess: true,
      });
      await booted.frogbot.create({
        collection: accessWhereSlug,
        data: { title: 'hidden1', hidden: true },
        overrideAccess: true,
      });

      const result = await booted.frogbot.find({
        collection: accessWhereSlug,
        overrideAccess: false,
      });
      expect(result.docs).toHaveLength(2);
      expect(result.docs.every((d: any) => d.hidden !== true)).toBe(true);
    });

    it('count respects access filter', async () => {
      await booted.frogbot.create({
        collection: accessWhereSlug,
        data: { title: 'v', hidden: false },
        overrideAccess: true,
      });
      await booted.frogbot.create({
        collection: accessWhereSlug,
        data: { title: 'h', hidden: true },
        overrideAccess: true,
      });

      const result = await booted.frogbot.count({
        collection: accessWhereSlug,
        overrideAccess: false,
      });
      expect(result.totalDocs).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Field-level access
  // ═══════════════════════════════════════════════════════════════════════════

  describe('field-level access', () => {
    it('secret field is excluded from read response (field read access = false)', async () => {
      const doc = await booted.frogbot.create({
        collection: fieldAccessSlug,
        data: { secret: 'classified', public: 'open' },
        overrideAccess: true,
      });

      const found = await booted.frogbot.findByID({
        collection: fieldAccessSlug,
        id: doc.id,
        overrideAccess: false,
      });
      expect(found.secret).toBeUndefined();
    });

    it('public field is included in read response', async () => {
      const doc = await booted.frogbot.create({
        collection: fieldAccessSlug,
        data: { secret: 'classified', public: 'open' },
        overrideAccess: true,
      });

      const found = await booted.frogbot.findByID({
        collection: fieldAccessSlug,
        id: doc.id,
        overrideAccess: false,
      });
      expect(found.public).toBe('open');
    });

    it('cannot update secret field without overrideAccess', async () => {
      const doc = await booted.frogbot.create({
        collection: fieldAccessSlug,
        data: { secret: 'original', public: 'open' },
        overrideAccess: true,
      });

      await booted.frogbot.update({
        collection: fieldAccessSlug,
        id: doc.id,
        data: { secret: 'hacked' },
        overrideAccess: false,
      });

      // Field update access = false means the value doesn't change
      const found = await booted.frogbot.findByID({
        collection: fieldAccessSlug,
        id: doc.id,
        overrideAccess: true,
      });
      expect(found.secret).toBe('original');
    });

    it('can update public field normally', async () => {
      const doc = await booted.frogbot.create({
        collection: fieldAccessSlug,
        data: { secret: 'classified', public: 'open' },
        overrideAccess: true,
      });

      await booted.frogbot.update({
        collection: fieldAccessSlug,
        id: doc.id,
        data: { public: 'new-value' },
        overrideAccess: false,
      });

      const found = await booted.frogbot.findByID({
        collection: fieldAccessSlug,
        id: doc.id,
        overrideAccess: true,
      });
      expect(found.public).toBe('new-value');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Validate with req.frogbot
  // ═══════════════════════════════════════════════════════════════════════════

  describe('validate with req.frogbot', () => {
    it('create succeeds when mustMatch === title', async () => {
      const doc = await booted.frogbot.create({
        collection: validateSlug,
        data: { title: 'hello', mustMatch: 'hello' },
        overrideAccess: true,
      });
      expect(doc.id).toBeDefined();
      expect(doc.mustMatch).toBe('hello');
    });

    it('create fails when mustMatch !== title', async () => {
      await expect(
        booted.frogbot.create({
          collection: validateSlug,
          data: { title: 'hello', mustMatch: 'wrong' },
          overrideAccess: true,
        }),
      ).rejects.toThrow();
    });

    it('error message is returned in response', async () => {
      try {
        await booted.frogbot.create({
          collection: validateSlug,
          data: { title: 'hello', mustMatch: 'mismatch' },
          overrideAccess: true,
        });
        expect.fail('should have thrown');
      } catch (err: any) {
        const message = err.message || JSON.stringify(err);
        expect(message.toLowerCase()).toContain('must match');
      }
    });

    it('req.frogbot is defined in validate context', async () => {
      // If req.frogbot were not available, the validate fn returns
      // 'req.frogbot is not available' which would cause a validation error
      // even when mustMatch === title
      const doc = await booted.frogbot.create({
        collection: validateSlug,
        data: { title: 'check', mustMatch: 'check' },
        overrideAccess: true,
      });
      expect(doc.id).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // overrideAccess forwarding
  // ═══════════════════════════════════════════════════════════════════════════

  describe('overrideAccess forwarding', () => {
    it('with overrideAccess=true, can read from restricted collection', async () => {
      const doc = await booted.frogbot.create({
        collection: overrideAccessSlug,
        data: { title: 'restricted' },
        overrideAccess: true,
      });

      const found = await booted.frogbot.findByID({
        collection: overrideAccessSlug,
        id: doc.id,
        overrideAccess: true,
      });
      expect(found.title).toBe('restricted');
    });

    it('with overrideAccess=false, read is denied', async () => {
      const doc = await booted.frogbot.create({
        collection: overrideAccessSlug,
        data: { title: 'restricted' },
        overrideAccess: true,
      });

      await expect(
        booted.frogbot.findByID({
          collection: overrideAccessSlug,
          id: doc.id,
          overrideAccess: false,
        }),
      ).rejects.toThrow();
    });

    it('find throws when access is denied (boolean false)', async () => {
      await booted.frogbot.create({
        collection: overrideAccessSlug,
        data: { title: 'restricted' },
        overrideAccess: true,
      });

      await expect(
        booted.frogbot.find({
          collection: overrideAccessSlug,
          overrideAccess: false,
        }),
      ).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Auth hooks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('auth hooks', () => {
    async function createVerifiedUser(email = testUserEmail, password = testUserPassword) {
      await booted.frogbot.create({
        collection: usersSlug,
        data: { email, password, name: 'Test User', _verified: true } as any,
        overrideAccess: true,
      });
    }

    it('login returns a token', async () => {
      await createVerifiedUser();
      const result = await booted.frogbot.login({
        collection: usersSlug,
        data: { email: testUserEmail, password: testUserPassword },
      });
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
    });

    it('login with wrong password fails', async () => {
      await createVerifiedUser();
      await expect(
        booted.frogbot.login({
          collection: usersSlug,
          data: { email: testUserEmail, password: 'wrong-password' },
        }),
      ).rejects.toThrow();
    });

    it('after login, lastLogin field is updated to a recent timestamp', async () => {
      await createVerifiedUser();
      const before = Date.now();
      await booted.frogbot.login({
        collection: usersSlug,
        data: { email: testUserEmail, password: testUserPassword },
      });

      const user = await booted.frogbot.find({
        collection: usersSlug,
        where: { email: { equals: testUserEmail } },
        overrideAccess: true,
      });

      const lastLogin = user.docs[0]?.lastLogin;
      expect(lastLogin).toBeDefined();
      const loginTime = new Date(lastLogin!).getTime();
      expect(loginTime).toBeGreaterThanOrEqual(before - 1000);
      expect(loginTime).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('req.frogbot is available in afterLogin hook (field update proves it)', async () => {
      await createVerifiedUser();
      await booted.frogbot.login({
        collection: usersSlug,
        data: { email: testUserEmail, password: testUserPassword },
      });

      const user = await booted.frogbot.find({
        collection: usersSlug,
        where: { email: { equals: testUserEmail } },
        overrideAccess: true,
      });

      expect(user.docs[0]?.lastLogin).toBeDefined();
    });

    it('refresh endpoint returns a new token', async () => {
      await createVerifiedUser();
      const loginRes = await booted.restClient.post(`/api/${usersSlug}/login`, {
        email: testUserEmail,
        password: testUserPassword,
      });
      const token = (loginRes.body as any).token;

      const res = await booted.restClient.post(`/api/${usersSlug}/refresh-token`, undefined, {
        headers: { Authorization: `JWT ${token}` },
      });
      expect(res.status).toBe(200);
      expect((res.body as any).refreshedToken).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Auth operations (forgotPassword, resetPassword, verifyEmail, unlock)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('auth operations', () => {
    async function createVerifiedUser(email = testUserEmail, password = testUserPassword) {
      await booted.frogbot.create({
        collection: usersSlug,
        data: { email, password, name: 'Test User', _verified: true } as any,
        overrideAccess: true,
      });
    }

    async function createUnverifiedUser(email = testUserEmail, password = testUserPassword) {
      await booted.frogbot.create({
        collection: usersSlug,
        data: { email, password, name: 'Test User' } as any,
        overrideAccess: true,
      });
    }

    describe('forgotPassword + resetPassword', () => {
      it('forgotPassword returns a token string', async () => {
        await createVerifiedUser();
        const token = await booted.frogbot.forgotPassword({
          collection: usersSlug,
          data: { email: testUserEmail },
          disableEmail: true,
        });
        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
      });

      it('resetPassword changes the password using the token', async () => {
        await createVerifiedUser();
        const token = await booted.frogbot.forgotPassword({
          collection: usersSlug,
          data: { email: testUserEmail },
          disableEmail: true,
        });

        const result = await booted.frogbot.resetPassword({
          collection: usersSlug,
          data: { token, password: 'new-password-456' },
          overrideAccess: true,
        });
        expect(result.user).toBeDefined();

        // Can login with new password
        const loginResult = await booted.frogbot.login({
          collection: usersSlug,
          data: { email: testUserEmail, password: 'new-password-456' },
        });
        expect(loginResult.token).toBeDefined();
      });

      it('resetPassword with invalid token throws', async () => {
        await createVerifiedUser();
        await expect(
          booted.frogbot.resetPassword({
            collection: usersSlug,
            data: { token: 'invalid-token', password: 'doesnt-matter' },
            overrideAccess: true,
          }),
        ).rejects.toThrow();
      });
    });

    describe('verifyEmail', () => {
      it('verifyEmail confirms the user with a valid token', async () => {
        await createUnverifiedUser();

        // Get the verification token with showHiddenFields
        const users = await booted.frogbot.find({
          collection: usersSlug,
          where: { email: { equals: testUserEmail } },
          overrideAccess: true,
          showHiddenFields: true,
        });
        const verificationToken = (users.docs[0] as any)?._verificationToken;
        expect(verificationToken).toBeDefined();

        const result = await booted.frogbot.verifyEmail({
          collection: usersSlug,
          token: verificationToken,
        });
        expect(result).toBe(true);
      });

      it('verifyEmail with invalid token throws', async () => {
        await createUnverifiedUser();
        await expect(
          booted.frogbot.verifyEmail({
            collection: usersSlug,
            token: 'bad-token',
          }),
        ).rejects.toThrow();
      });
    });

    describe('unlock', () => {
      it('unlock restores access after account lockout', async () => {
        await createVerifiedUser();

        // Trigger lockout by exceeding maxLoginAttempts (2)
        for (let i = 0; i < 3; i++) {
          try {
            await booted.frogbot.login({
              collection: usersSlug,
              data: { email: testUserEmail, password: 'wrong' },
            });
          } catch {
            // expected
          }
        }

        // Account should be locked — login with correct password fails
        await expect(
          booted.frogbot.login({
            collection: usersSlug,
            data: { email: testUserEmail, password: testUserPassword },
          }),
        ).rejects.toThrow();

        // Unlock the account
        const result = await booted.frogbot.unlock({
          collection: usersSlug,
          data: { email: testUserEmail },
          overrideAccess: true,
        });
        expect(result).toBe(true);

        // Can login again
        const loginResult = await booted.frogbot.login({
          collection: usersSlug,
          data: { email: testUserEmail, password: testUserPassword },
        });
        expect(loginResult.token).toBeDefined();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // afterOperation result mutation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('afterOperation result mutation', () => {
    it('create returns title with " [processed]" appended', async () => {
      const doc = await booted.frogbot.create({
        collection: afterOpSlug,
        data: { title: 'hello' },
        overrideAccess: true,
      });
      expect(doc.title).toBe('hello [processed]');
    });

    it('the DB value does NOT have " [processed]" (mutation is response-only)', async () => {
      const doc = await booted.frogbot.create({
        collection: afterOpSlug,
        data: { title: 'hello' },
        overrideAccess: true,
      });

      // Read directly - afterRead doesn't mutate, only afterChange does
      // But afterRead also fires on findByID... the afterChange hook only
      // fires on create/update. So the DB value should be 'hello'.
      // Use payload directly to bypass afterChange return value.
      const raw = await booted.payload.findByID({
        collection: afterOpSlug,
        id: doc.id,
        overrideAccess: true,
      });
      expect(raw.title).toBe('hello');
    });

    it('update also returns the mutated title', async () => {
      const doc = await booted.frogbot.create({
        collection: afterOpSlug,
        data: { title: 'original' },
        overrideAccess: true,
      });

      const updated = await booted.frogbot.update({
        collection: afterOpSlug,
        id: doc.id,
        data: { title: 'revised' },
        overrideAccess: true,
      });
      expect(updated.title).toBe('revised [processed]');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Context flow between hooks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('context flow between hooks', () => {
    it('beforeChange sets context.seedValue', async () => {
      // Indirectly tested by the next assertion — if beforeChange didn't set it,
      // afterChange wouldn't write 'seeded' to contextResult.
      const doc = await booted.frogbot.create({
        collection: contextFlowSlug,
        data: { title: 'test' },
        overrideAccess: true,
      });
      expect(doc.id).toBeDefined();
    });

    it('afterChange reads context.seedValue and writes to contextResult field', async () => {
      const doc = await booted.frogbot.create({
        collection: contextFlowSlug,
        data: { title: 'test' },
        overrideAccess: true,
      });

      const fetched = await booted.frogbot.findByID({
        collection: contextFlowSlug,
        id: doc.id,
        overrideAccess: true,
      });
      expect(fetched.contextResult).toBe('seeded');
    });

    it('after create, contextResult field equals "seeded"', async () => {
      const doc = await booted.frogbot.create({
        collection: contextFlowSlug,
        data: { title: 'another' },
        overrideAccess: true,
      });

      const fetched = await booted.frogbot.findByID({
        collection: contextFlowSlug,
        id: doc.id,
        overrideAccess: true,
      });
      expect(fetched.contextResult).toBe('seeded');
    });

    it('context is isolated per-request (second request does not see first context)', async () => {
      const doc1 = await booted.frogbot.create({
        collection: contextFlowSlug,
        data: { title: 'first' },
        overrideAccess: true,
        context: { seedValue: 'custom-from-api' },
      });

      const doc2 = await booted.frogbot.create({
        collection: contextFlowSlug,
        data: { title: 'second' },
        overrideAccess: true,
      });

      const fetched1 = await booted.frogbot.findByID({
        collection: contextFlowSlug,
        id: doc1.id,
        overrideAccess: true,
      });
      const fetched2 = await booted.frogbot.findByID({
        collection: contextFlowSlug,
        id: doc2.id,
        overrideAccess: true,
      });

      // First request uses custom context passed from API
      expect(fetched1.contextResult).toBe('custom-from-api');
      // Second request uses the default 'seeded' from beforeChange
      expect(fetched2.contextResult).toBe('seeded');
    });
  });
});
