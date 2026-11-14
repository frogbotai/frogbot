import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { policy, stopProvider, usersSlug } from './config.js';
import {
  createHarness,
  password,
  pendingCookieName,
  tokenCookieName,
  twoFactorURL,
} from './helpers.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('two-factor sign-in', () => {
  let booted: BootedFrogBot;
  const t = createHarness(() => booted);

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'two-factor-sign-in');
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

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('after a sign-in provider', () => {
    it('pauses with only an HttpOnly, SameSite=Lax, path-scoped pending cookie and no session', async () => {
      await t.createUser('priya@example.com');
      const { secret } = await t.enable('priya@example.com');

      await booted.payload.db.updateOne({
        collection: usersSlug,
        where: { email: { equals: 'priya@example.com' } },
        data: { sessions: [] },
      });

      const paused = await t.providerSignIn('priya@example.com', '/admin/account');

      expect(paused.status).toBe(303);
      expect(paused.headers.get('location')).toBe(twoFactorURL);
      expect(t.cookie(paused, tokenCookieName)).toBeUndefined();

      const pending = t.cookies(paused).find((value) => value.startsWith(`${pendingCookieName}=`))!;

      expect(pending).toMatch(
        new RegExp(
          `^${pendingCookieName}=[\\w-]{43}; Path=${twoFactorURL}; Max-Age=600; HttpOnly; SameSite=Lax$`,
        ),
      );
      expect(paused.headers.get('location')).not.toContain(pending.split(';')[0].split('=')[1]);
      expect(await t.sessions('priya@example.com')).toEqual([]);

      const cookie = t.cookie(paused, pendingCookieName)!;
      const page = await t.request(twoFactorURL, { headers: { cookie } });
      const html = await page.text();

      expect(page.status).toBe(200);
      expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(html).toContain(`action="${twoFactorURL}/verify"`);

      const wrong = await t.form(`${twoFactorURL}/verify`, { code: '000000' }, cookie);

      expect(wrong.status).toBe(401);
      expect(await wrong.text()).toContain('That code didn&#39;t work.');
      expect(await t.sessions('priya@example.com')).toEqual([]);

      const code = await t.nextCode('priya@example.com', secret);
      const finished = await t.form(`${twoFactorURL}/verify`, { code }, cookie);

      expect(finished.status).toBe(200);
      expect(await finished.text()).toContain('content="0;url=/admin/account"');
      expect(t.cookie(finished, tokenCookieName)).toBeDefined();
      expect(t.cookies(finished)).toContain(
        `${pendingCookieName}=; Path=${twoFactorURL}; Max-Age=0; HttpOnly; SameSite=Lax`,
      );
      expect(await t.sessions('priya@example.com')).toHaveLength(1);

      const replay = await t.form(`${twoFactorURL}/verify`, { code }, cookie);

      expect(replay.status).toBe(400);
      expect(await t.sessions('priya@example.com')).toHaveLength(1);
    });

    it('lets users without two-factor sign-in through', async () => {
      await t.createUser('plain@example.com');

      const response = await t.providerSignIn('plain@example.com');

      expect(response.status).toBe(200);
      expect(t.cookie(response, tokenCookieName)).toBeDefined();
      expect(t.cookie(response, pendingCookieName)).toBeUndefined();
    });

    it('binds the pending sign-in to its cookie and expires it after ten minutes', async () => {
      await t.createUser('bound@example.com');
      const { secret } = await t.enable('bound@example.com');
      const cookie = t.cookie(await t.providerSignIn('bound@example.com'), pendingCookieName)!;
      const code = await t.nextCode('bound@example.com', secret);

      expect((await t.json(`${twoFactorURL}/verify`, { code })).status).toBe(400);
      expect(
        (
          await t.json(
            `${twoFactorURL}/verify`,
            { code },
            { cookie: `${pendingCookieName}=forged` },
          )
        ).status,
      ).toBe(400);
      expect((await t.request(twoFactorURL)).status).toBe(400);

      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 10 * 60 * 1000 + 1000 });

      expect((await t.request(twoFactorURL, { headers: { cookie } })).status).toBe(400);
      expect((await t.form(`${twoFactorURL}/verify`, { code }, cookie)).status).toBe(400);

      vi.useRealTimers();

      expect(await t.sessions('bound@example.com')).toHaveLength(1);
    });

    it('gives the pending cookie no access to the API, the admin or refresh-token', async () => {
      await t.createUser('nothing@example.com');
      await t.enable('nothing@example.com');

      await booted.payload.db.updateOne({
        collection: usersSlug,
        where: { email: { equals: 'nothing@example.com' } },
        data: { sessions: [] },
      });

      const cookie = t.cookie(await t.providerSignIn('nothing@example.com'), pendingCookieName)!;
      const headers = { cookie };

      const me = (await (await t.request(`/api/${usersSlug}/me`, { headers })).json()) as {
        user: unknown;
      };

      const access = (await (await t.request('/api/access', { headers })).json()) as {
        canAccessAdmin: boolean;
      };

      expect(me.user).toBeNull();
      expect(access.canAccessAdmin).not.toBe(true);
      expect((await t.request(`/api/${usersSlug}`, { headers })).status).toBe(403);
      expect(
        (await t.request(`/api/${usersSlug}/refresh-token`, { method: 'POST', headers })).status,
      ).toBeGreaterThanOrEqual(400);
      expect(await t.sessions('nothing@example.com')).toEqual([]);

      await t.createUser('signed-in@example.com');
      const signedIn = (await (
        await t.request('/api/access', { headers: t.auth(await t.token('signed-in@example.com')) })
      ).json()) as { canAccessAdmin?: boolean };

      expect(signedIn.canAccessAdmin).toBe(true);
    });

    it('refuses the sixth wrong code in ten minutes, even with a fresh pending sign-in and the right code', async () => {
      await t.createUser('locked@example.com');
      const { secret } = await t.enable('locked@example.com');
      const first = t.cookie(await t.providerSignIn('locked@example.com'), pendingCookieName)!;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect(
          (await t.json(`${twoFactorURL}/verify`, { code: '000000' }, { cookie: first })).status,
        ).toBe(401);
      }

      const fresh = t.cookie(await t.providerSignIn('locked@example.com'), pendingCookieName)!;
      const refused = await t.json(
        `${twoFactorURL}/verify`,
        { code: await t.nextCode('locked@example.com', secret) },
        { cookie: fresh },
      );

      expect(refused.status).toBe(429);
      expect(await refused.json()).toEqual({
        errors: [{ message: 'Too many wrong codes. Try again in 10 minutes.' }],
      });
      expect(await t.sessions('locked@example.com')).toHaveLength(1);
    });

    it('clears the wrong-code count after a right code', async () => {
      await t.createUser('reset-count@example.com');
      const { secret } = await t.enable('reset-count@example.com');
      const cookie = t.cookie(
        await t.providerSignIn('reset-count@example.com'),
        pendingCookieName,
      )!;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await t.json(`${twoFactorURL}/verify`, { code: '000000' }, { cookie });
      }

      const code = await t.nextCode('reset-count@example.com', secret);

      expect((await t.json(`${twoFactorURL}/verify`, { code }, { cookie })).status).toBe(200);

      const again = t.cookie(await t.providerSignIn('reset-count@example.com'), pendingCookieName)!;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        expect(
          (await t.json(`${twoFactorURL}/verify`, { code: '000000' }, { cookie: again })).status,
        ).toBe(401);
      }
    });

    it('sends a required user without two-factor sign-in to setup before any session exists', async () => {
      await t.createUser('admin@example.com', { role: 'admin' });

      const paused = await t.providerSignIn('admin@example.com', '/admin');
      const cookie = t.cookie(paused, pendingCookieName)!;

      expect(paused.status).toBe(303);

      const page = await t.request(twoFactorURL, { headers: { cookie } });

      expect(await page.text()).toMatch(/<img src="data:image\/png;base64,[^"]+"/);

      const details = (await (
        await t.request(twoFactorURL, { headers: { cookie, accept: 'application/json' } })
      ).json()) as { twoFactor: string; secret: string; uri: string; qrCode: string };

      expect(details).toEqual({
        twoFactor: 'setup',
        secret: expect.stringMatching(/^[A-Z2-7]{32}$/),
        uri: expect.stringContaining('otpauth://totp/Acme:admin%40example.com?'),
        qrCode: expect.stringMatching(/^data:image\/png;base64,/),
      });

      expect((await t.form(`${twoFactorURL}/setup`, { code: '000000' }, cookie)).status).toBe(401);

      const confirmed = await t.form(
        `${twoFactorURL}/setup`,
        { code: await t.nextCode('admin@example.com', details.secret) },
        cookie,
      );

      const codes = [...(await confirmed.text()).matchAll(/<li>([a-z2-9]{5}-[a-z2-9]{5})<\/li>/g)];

      expect(confirmed.status).toBe(200);
      expect(codes).toHaveLength(10);
      expect(await t.sessions('admin@example.com')).toEqual([]);
      expect((await t.user('admin@example.com')).twoFactorEnabled).toBe(true);

      const finished = await t.form(`${twoFactorURL}/continue`, {}, cookie);

      expect(finished.status).toBe(200);
      expect(await finished.text()).toContain('content="0;url=/admin"');
      expect(await t.sessions('admin@example.com')).toHaveLength(1);
      expect((await t.form(`${twoFactorURL}/continue`, {}, cookie)).status).toBe(400);
      expect(t.emails()).toEqual([
        { to: 'admin@example.com', subject: 'Two-factor sign-in is on' },
      ]);
    });
  });

  describe('after a password', () => {
    it('answers 202 with the code step and no token or session, then one session after the code', async () => {
      await t.createUser('json@example.com');
      const { secret } = await t.enable('json@example.com');

      await booted.payload.db.updateOne({
        collection: usersSlug,
        where: { email: { equals: 'json@example.com' } },
        data: { sessions: [] },
      });

      const paused = await t.login('json@example.com');

      expect(paused.status).toBe(202);
      expect(await paused.json()).toEqual({
        message: 'Enter the code from your authenticator app.',
        twoFactor: 'code',
        url: twoFactorURL,
      });
      expect(t.cookie(paused, tokenCookieName)).toBeUndefined();
      expect(await t.sessions('json@example.com')).toEqual([]);

      const cookie = t.cookie(paused, pendingCookieName)!;
      const wrong = await t.json(`${twoFactorURL}/verify`, { code: '123456' }, { cookie });

      expect(wrong.status).toBe(401);
      expect(await wrong.json()).toEqual({ errors: [{ message: "That code didn't work." }] });

      const finished = await t.json(
        `${twoFactorURL}/verify`,
        { code: await t.nextCode('json@example.com', secret) },
        { cookie },
      );

      const body = (await finished.json()) as { token: string; user: Record<string, unknown> };

      expect(finished.status).toBe(200);
      expect(body).toEqual(
        expect.objectContaining({ token: expect.any(String), exp: expect.any(Number) }),
      );
      expect(body.user).not.toHaveProperty('twoFactorSecret');
      expect(body.user).not.toHaveProperty('twoFactorRecovery');
      expect(body.user.twoFactorEnabled).toBe(true);
      expect(await t.sessions('json@example.com')).toHaveLength(1);

      const me = (await (
        await t.request(`/api/${usersSlug}/me`, { headers: t.auth(body.token) })
      ).json()) as { user: { email: string } };

      expect(me.user.email).toBe('json@example.com');
    });

    it('answers a wrong password exactly as for a user without two-factor sign-in', async () => {
      await t.createUser('wrong@example.com');
      await t.enable('wrong@example.com');
      await t.createUser('plain-wrong@example.com');

      const withCode = await t.login('wrong@example.com', { password: 'nope' });
      const without = await t.login('plain-wrong@example.com', { password: 'nope' });

      expect(withCode.status).toBe(without.status);
      expect(await withCode.json()).toEqual(await without.json());
      expect(t.cookie(withCode, pendingCookieName)).toBeUndefined();
    });

    it('takes precedence over the default login and keeps it for users without two-factor sign-in', async () => {
      const login = booted.payload.collections[usersSlug].config.endpoints
        ? booted.payload.collections[usersSlug].config.endpoints.find(
            (endpoint) => endpoint.method === 'post' && endpoint.path === '/login',
          )
        : undefined;

      expect(login?.custom).toEqual({ 'plugin-two-factor': true });

      await t.createUser('normal@example.com');
      const response = await t.login('normal@example.com');
      const body = (await response.json()) as { token?: string; message: string };

      expect(response.status).toBe(200);
      expect(body.token).toEqual(expect.any(String));
      expect(t.cookie(response, tokenCookieName)).toBeDefined();
      expect(await t.sessions('normal@example.com')).toHaveLength(1);
    });

    it('continues to the posted returnTo from the code page', async () => {
      await t.createUser('page@example.com');
      const { recoveryCodes } = await t.enable('page@example.com');

      const paused = await t.login('page@example.com', { returnTo: '/admin/collections' });
      const cookie = t.cookie(paused, pendingCookieName)!;
      const finished = await t.form(`${twoFactorURL}/verify`, { code: recoveryCodes[0] }, cookie);

      expect(finished.status).toBe(200);
      expect(await finished.text()).toContain('content="0;url=/admin/collections"');
      expect(t.emails().map(({ subject }) => subject)).toContain('A recovery code was used');
      expect((await t.login('page@example.com', { returnTo: 'https://evil.test/' })).status).toBe(
        400,
      );
    });

    it('sends a required user to setup and gives JSON clients their recovery codes with the token', async () => {
      await t.createUser('setup@example.com', { role: 'admin' });

      const paused = await t.login('setup@example.com');
      const cookie = t.cookie(paused, pendingCookieName)!;

      expect(paused.status).toBe(202);
      expect(((await paused.json()) as { twoFactor: string }).twoFactor).toBe('setup');

      const { secret } = (await (
        await t.request(twoFactorURL, { headers: { cookie, accept: 'application/json' } })
      ).json()) as { secret: string };

      const finished = await t.json(
        `${twoFactorURL}/setup`,
        { code: await t.nextCode('setup@example.com', secret) },
        { cookie },
      );

      const body = (await finished.json()) as { token: string; recoveryCodes: string[] };

      expect(finished.status).toBe(200);
      expect(body.token).toEqual(expect.any(String));
      expect(body.recoveryCodes).toHaveLength(10);
      expect(await t.sessions('setup@example.com')).toHaveLength(1);
    });
  });

  describe('reset-password', () => {
    it('saves the password, ends every session and signs nobody in', async () => {
      await t.createUser('forgot@example.com');
      await t.enable('forgot@example.com');

      expect(await t.sessions('forgot@example.com')).toHaveLength(1);

      const token = await booted.payload.forgotPassword({
        collection: usersSlug,
        data: { email: 'forgot@example.com' },
        disableEmail: true,
      });

      const reset = await t.json(`/api/${usersSlug}/reset-password`, {
        token,
        password: 'a-new-password',
      });

      expect(reset.status).toBe(200);
      expect(await reset.json()).toEqual({
        message: expect.any(String),
        twoFactor: 'signIn',
      });
      expect(t.cookies(reset)).toEqual([]);
      expect(await t.sessions('forgot@example.com')).toEqual([]);
      expect((await t.login('forgot@example.com')).status).toBe(401);
      expect((await t.login('forgot@example.com', { password: 'a-new-password' })).status).toBe(
        202,
      );
    });

    it('signs in a user without two-factor sign-in as before', async () => {
      await t.createUser('plain-forgot@example.com');

      const token = await booted.payload.forgotPassword({
        collection: usersSlug,
        data: { email: 'plain-forgot@example.com' },
        disableEmail: true,
      });

      const reset = await t.json(`/api/${usersSlug}/reset-password`, { token, password });

      expect(reset.status).toBe(200);
      expect(((await reset.json()) as { token?: string }).token).toEqual(expect.any(String));
      expect(t.cookie(reset, tokenCookieName)).toBeDefined();
    });
  });
});
