import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

const firstRegisterURL = `/api/${usersSlug}/first-register`;

describe('two-factor first-register', () => {
  let booted: BootedFrogBot;
  const t = createHarness(() => booted);

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'two-factor-first-register');
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

  it('creates a required first user and sends them to setup with no token or session', async () => {
    const registered = await t.json(firstRegisterURL, {
      email: 'first@example.com',
      password,
      role: 'admin',
    });

    expect(registered.status).toBe(202);
    expect(await registered.json()).toEqual({
      message: expect.any(String),
      twoFactor: 'setup',
      url: twoFactorURL,
    });
    expect(t.cookie(registered, tokenCookieName)).toBeUndefined();
    expect(await t.sessions('first@example.com')).toEqual([]);

    const cookie = t.cookie(registered, pendingCookieName)!;
    const { secret } = (await (
      await t.request(twoFactorURL, { headers: { cookie, accept: 'application/json' } })
    ).json()) as { secret: string };

    const finished = await t.json(
      `${twoFactorURL}/setup`,
      { code: await t.nextCode('first@example.com', secret) },
      { cookie },
    );

    expect(finished.status).toBe(200);
    expect(((await finished.json()) as { token?: string }).token).toEqual(expect.any(String));
    expect(await t.sessions('first@example.com')).toHaveLength(1);
    expect((await t.user('first@example.com')).twoFactorEnabled).toBe(true);
  });

  it('makes the setup page continue to the posted returnTo', async () => {
    const registered = await t.json(firstRegisterURL, {
      email: 'first@example.com',
      password,
      role: 'admin',
      returnTo: '/admin/collections/users',
    });

    const cookie = t.cookie(registered, pendingCookieName)!;
    const { secret } = (await (
      await t.request(twoFactorURL, { headers: { cookie, accept: 'application/json' } })
    ).json()) as { secret: string };

    const confirmed = await t.form(
      `${twoFactorURL}/setup`,
      { code: await t.nextCode('first@example.com', secret) },
      cookie,
    );

    expect(await confirmed.text()).toContain('Save these recovery codes');

    const continued = await t.form(`${twoFactorURL}/continue`, {}, cookie);

    expect(await continued.text()).toContain('content="0;url=/admin/collections/users"');
    expect(t.cookie(continued, tokenCookieName)).toBeDefined();
  });

  it('refuses a foreign returnTo before creating anyone', async () => {
    const registered = await t.json(firstRegisterURL, {
      email: 'first@example.com',
      password,
      returnTo: 'https://elsewhere.example/',
    });

    expect(registered.status).toBe(400);
    expect(await booted.payload.count({ collection: usersSlug, overrideAccess: true })).toEqual({
      totalDocs: 0,
    });
  });

  it('signs in a first user that two-factor sign-in does not cover, as before', async () => {
    const registered = await t.json(firstRegisterURL, { email: 'plain@example.com', password });
    const body = (await registered.json()) as { token?: string; user?: { email: string } };

    expect(registered.status).toBe(200);
    expect(body.token).toEqual(expect.any(String));
    expect(body.user?.email).toBe('plain@example.com');
    expect(t.cookie(registered, tokenCookieName)).toBeDefined();
    expect(await t.sessions('plain@example.com')).toHaveLength(1);
  });
});
