import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { policy, stopProvider, usersSlug } from './config.js';
import { createHarness, pendingCookieName, twoFactorURL } from './helpers.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('two-factor account endpoints', () => {
  let booted: BootedFrogBot;
  const t = createHarness(() => booted);

  const me = async (token: string) =>
    (
      (await (await t.request(`/api/${usersSlug}/me`, { headers: t.auth(token) })).json()) as {
        user: { email: string } | null;
      }
    ).user;

  const signInWithCode = async (email: string, code: string) => {
    const cookie = t.cookie(await t.login(email), pendingCookieName)!;

    return t.json(`${twoFactorURL}/verify`, { code }, { cookie });
  };

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'two-factor-account');
    vi.spyOn(booted.frogbot.email, 'sendEmail').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await booted?.shutdown();
    await stopProvider();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    await booted.frogbot.kv.clear();
    vi.mocked(booted.frogbot.email.sendEmail).mockClear();
    policy.requireAdmins = true;
  });

  it('turns on with a confirmed code, keeps only the current session and hides the secret', async () => {
    await t.createUser('turn-on@example.com');
    const current = await t.token('turn-on@example.com');
    const other = await t.token('turn-on@example.com');

    expect(await t.sessions('turn-on@example.com')).toHaveLength(2);

    const started = await t.json(`${twoFactorURL}/enable/start`, {}, t.auth(current));
    const { secret, uri, qrCode } = (await started.json()) as Record<string, string>;

    expect(started.status).toBe(200);
    expect(uri).toContain('otpauth://totp/Acme:turn-on%40example.com?');
    expect(qrCode).toMatch(/^data:image\/png;base64,/);

    const wrong = await t.json(`${twoFactorURL}/enable`, { code: '000000' }, t.auth(current));

    expect(wrong.status).toBe(401);
    expect((await t.user('turn-on@example.com')).twoFactorEnabled).toBe(false);

    const enabled = await t.json(
      `${twoFactorURL}/enable`,
      { code: await t.nextCode('turn-on@example.com', secret) },
      t.auth(current),
    );

    const body = (await enabled.json()) as { message: string; recoveryCodes: string[] };

    expect(enabled.status).toBe(200);
    expect(body.recoveryCodes).toHaveLength(10);
    expect(await t.sessions('turn-on@example.com')).toHaveLength(1);
    expect(await me(current)).toEqual(expect.objectContaining({ email: 'turn-on@example.com' }));
    expect(await me(other)).toBeNull();
    expect(t.emails()).toEqual([
      { to: 'turn-on@example.com', subject: 'Two-factor sign-in is on' },
    ]);

    const stored = await t.user('turn-on@example.com');

    expect(stored.twoFactorSecret).toMatch(/^v1\./);
    expect(stored.twoFactorSecret).not.toContain(secret);
    expect(stored.twoFactorRecovery).toHaveLength(10);
    expect(stored.twoFactorRecovery).not.toContain(body.recoveryCodes[0]);

    const read = (await (
      await t.request(`/api/${usersSlug}/${stored.id}`, { headers: t.auth(current) })
    ).json()) as Record<string, unknown>;

    expect(read.twoFactorEnabled).toBe(true);
    expect(read).not.toHaveProperty('twoFactorSecret');
    expect(read).not.toHaveProperty('twoFactorRecovery');
    expect(read).not.toHaveProperty('twoFactorLastStep');

    await t.request(`/api/${usersSlug}/${stored.id}`, {
      method: 'PATCH',
      headers: { ...t.auth(current), 'content-type': 'application/json' },
      body: JSON.stringify({
        twoFactorEnabled: false,
        twoFactorSecret: 'x',
        twoFactorRecovery: [],
      }),
    });

    const after = await t.user('turn-on@example.com');

    expect(after.twoFactorEnabled).toBe(true);
    expect(after.twoFactorSecret).toBe(stored.twoFactorSecret);
    expect(after.twoFactorRecovery).toEqual(stored.twoFactorRecovery);
  });

  it('refuses to turn on with 403 when canEnable returns false', async () => {
    await t.createUser('blocked@example.com', { noTwoFactor: true });
    const token = await t.token('blocked@example.com');

    expect((await t.json(`${twoFactorURL}/enable/start`, {}, t.auth(token))).status).toBe(403);
    expect((await t.json(`${twoFactorURL}/enable`, { code: '123456' }, t.auth(token))).status).toBe(
      403,
    );
  });

  it('refuses the account endpoints without a signed-in user', async () => {
    for (const endpoint of ['enable/start', 'enable', 'recovery-codes', 'disable', 'reset']) {
      expect((await t.json(`${twoFactorURL}/${endpoint}`, {})).status).toBe(401);
    }
  });

  it('makes new recovery codes with a code, voiding the old set, and each works once', async () => {
    await t.createUser('codes@example.com');
    const { secret, recoveryCodes: old, token } = await t.enable('codes@example.com');

    expect(
      (await t.json(`${twoFactorURL}/recovery-codes`, { code: '000000' }, t.auth(token))).status,
    ).toBe(401);

    const fresh = await t.json(
      `${twoFactorURL}/recovery-codes`,
      { code: await t.nextCode('codes@example.com', secret) },
      t.auth(token),
    );

    const { recoveryCodes } = (await fresh.json()) as { recoveryCodes: string[] };

    expect(fresh.status).toBe(200);
    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes).not.toContain(old[0]);
    expect(t.emails().map(({ subject }) => subject)).toContain('New recovery codes');
    expect((await signInWithCode('codes@example.com', old[0])).status).toBe(401);
    expect((await signInWithCode('codes@example.com', recoveryCodes[0])).status).toBe(200);
    expect((await signInWithCode('codes@example.com', recoveryCodes[0])).status).toBe(401);
    expect((await t.user('codes@example.com')).twoFactorRecovery).toHaveLength(9);
  });

  it('refuses to turn off while required, and turns off with a code once it is not', async () => {
    await t.createUser('required@example.com', { role: 'admin' });
    policy.requireAdmins = false;
    const { secret, token } = await t.enable('required@example.com');
    policy.requireAdmins = true;

    const refused = await t.json(
      `${twoFactorURL}/disable`,
      { code: await t.nextCode('required@example.com', secret) },
      t.auth(token),
    );

    expect(refused.status).toBe(403);
    expect((await t.user('required@example.com')).twoFactorEnabled).toBe(true);

    policy.requireAdmins = false;

    expect(
      (await t.json(`${twoFactorURL}/disable`, { code: '000000' }, t.auth(token))).status,
    ).toBe(401);

    const disabled = await t.json(
      `${twoFactorURL}/disable`,
      { code: await t.nextCode('required@example.com', secret) },
      t.auth(token),
    );

    expect(disabled.status).toBe(200);

    const stored = await t.user('required@example.com');

    expect(stored.twoFactorEnabled).toBe(false);
    expect(stored.twoFactorSecret).toBeNull();
    expect(stored.twoFactorRecovery).toBeNull();
    expect(await t.sessions('required@example.com')).toHaveLength(1);
    expect(t.emails().map(({ subject }) => subject)).toContain('Two-factor sign-in is off');
    expect((await t.login('required@example.com')).status).toBe(200);
  });

  it('lets canReset clear another user, ending every session, and never yourself', async () => {
    policy.requireAdmins = false;
    await t.createUser('admin@example.com', { role: 'admin' });
    await t.createUser('member@example.com');
    await t.createUser('lost@example.com', { role: 'admin' });
    const admin = await t.token('admin@example.com');
    const member = await t.token('member@example.com');
    const { token: lostToken } = await t.enable('lost@example.com');
    const lost = await t.user('lost@example.com');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signInWithCode('lost@example.com', '000000');
    }

    expect((await t.json(`${twoFactorURL}/reset`, { id: lost.id }, t.auth(member))).status).toBe(
      403,
    );

    const self = await t.user('admin@example.com');

    expect((await t.json(`${twoFactorURL}/reset`, { id: self.id }, t.auth(admin))).status).toBe(
      403,
    );

    const reset = await t.json(`${twoFactorURL}/reset`, { id: lost.id }, t.auth(admin));

    expect(reset.status).toBe(200);

    const stored = await t.user('lost@example.com');

    expect(stored.twoFactorEnabled).toBe(false);
    expect(stored.twoFactorSecret).toBeNull();
    expect(stored.twoFactorRecovery).toBeNull();
    expect(stored.twoFactorLastStep).toBeNull();
    expect(stored.sessions).toEqual([]);
    expect(await me(lostToken)).toBeNull();
    expect(t.emails()).toContainEqual({
      to: 'lost@example.com',
      subject: 'Two-factor sign-in was reset',
    });

    policy.requireAdmins = true;

    const next = await t.login('lost@example.com');

    expect(next.status).toBe(202);
    expect(((await next.json()) as { twoFactor: string }).twoFactor).toBe('setup');
  });
});
