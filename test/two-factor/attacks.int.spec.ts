import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Secret, TOTP } from 'otpauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { policy, stopProvider, usersSlug } from './config.js';
import { createHarness, pendingCookieName, twoFactorURL } from './helpers.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const codeNow = (secret: string) =>
  new TOTP({ secret: Secret.fromBase32(secret) }).generate({ timestamp: Date.now() });

describe('two-factor attacks', () => {
  let booted: BootedFrogBot;
  const t = createHarness(() => booted);

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'two-factor-attacks');
    vi.spyOn(booted.frogbot.email, 'sendEmail').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await booted?.shutdown();
    await stopProvider();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    await booted.frogbot.kv.clear();
    policy.requireAdmins = true;
  });

  it('own PATCH cannot clear or change the stored factor', async () => {
    await t.createUser('a@example.com');
    const { token } = await t.enable('a@example.com');
    const before = await t.user('a@example.com');

    await t.request(`/api/${usersSlug}/${before.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...t.auth(token) },
      body: JSON.stringify({
        role: 'x',
        twoFactorEnabled: false,
        twoFactorSecret: 'attacker',
        twoFactorRecovery: [],
        twoFactorLastStep: 0,
      }),
    });

    const after = await t.user('a@example.com');

    expect(after.twoFactorEnabled).toBe(true);
    expect(after.twoFactorSecret).toBe(before.twoFactorSecret);
    expect(after.twoFactorRecovery).toEqual(before.twoFactorRecovery);
    expect((await t.login('a@example.com')).status).toBe(202);
  });

  it('one code on two pending sign-ins at once gives one session', async () => {
    await t.createUser('c@example.com');
    const { secret } = await t.enable('c@example.com');

    await booted.payload.db.updateOne({
      collection: usersSlug,
      where: { email: { equals: 'c@example.com' } },
      data: { sessions: [] },
    });

    const p1 = t.cookie(await t.login('c@example.com'), pendingCookieName)!;
    const p2 = t.cookie(await t.login('c@example.com'), pendingCookieName)!;
    const code = await t.nextCode('c@example.com', secret);

    const [r1, r2] = await Promise.all([
      t.json(`${twoFactorURL}/verify`, { code }, { cookie: p1 }),
      t.json(`${twoFactorURL}/verify`, { code }, { cookie: p2 }),
    ]);

    console.log('C', r1.status, r2.status);

    expect([r1.status, r2.status].sort()).toEqual([200, 401]);
    expect(await t.sessions('c@example.com')).toHaveLength(1);
  });

  it('a setup started before the user set up 2FA cannot replace their factor', async () => {
    await t.createUser('f@example.com', { role: 'admin' });

    const attackerLogin = await t.login('f@example.com');

    expect(attackerLogin.status).toBe(202);

    const attacker = t.cookie(attackerLogin, pendingCookieName)!;
    const attackerSetup = (await (
      await t.request(twoFactorURL, { headers: { accept: 'application/json', cookie: attacker } })
    ).json()) as { secret: string };

    const ownerLogin = await t.login('f@example.com');
    const owner = t.cookie(ownerLogin, pendingCookieName)!;
    const ownerSetup = (await (
      await t.request(twoFactorURL, { headers: { accept: 'application/json', cookie: owner } })
    ).json()) as { secret: string };

    const ownerDone = await t.json(
      `${twoFactorURL}/setup`,
      { code: codeNow(ownerSetup.secret) },
      { cookie: owner },
    );

    expect(ownerDone.status).toBe(200);

    const ownerSecret = (await t.user('f@example.com')).twoFactorSecret;

    const attackerDone = await t.json(
      `${twoFactorURL}/setup`,
      { code: codeNow(attackerSetup.secret) },
      { cookie: attacker },
    );

    const body = (await attackerDone.json()) as { token?: string };
    console.log('F attacker setup', attackerDone.status, Boolean(body.token));

    expect(attackerDone.status).not.toBe(200);
    expect((await t.user('f@example.com')).twoFactorSecret).toBe(ownerSecret);
  });

  it('after admin reset of a required user, a code-mode pending made before the reset cannot finish', async () => {
    await t.createUser('admin@example.com', { role: 'admin', noTwoFactor: false });
    await t.createUser('g@example.com');
    const { secret } = await t.enable('g@example.com');
    const pending = t.cookie(await t.login('g@example.com'), pendingCookieName)!;

    policy.requireAdmins = false;
    const adminToken = await t.token('admin@example.com');
    const g = await t.user('g@example.com');
    const reset = await t.json(`${twoFactorURL}/reset`, { id: g.id }, t.auth(adminToken));

    expect(reset.status).toBe(200);

    const after = await t.json(
      `${twoFactorURL}/verify`,
      { code: await t.nextCode('g@example.com', secret) },
      { cookie: pending },
    );

    console.log('G', after.status);

    expect(after.status).not.toBe(200);
  });
});
