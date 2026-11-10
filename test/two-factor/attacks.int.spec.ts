import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPHQL_POST } from '@frogbotai/next/routes';
import { Secret, TOTP } from 'otpauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import config, { policy, stopProvider, usersSlug } from './config.js';
import {
  createHarness,
  password,
  pendingCookieName,
  tokenCookieName,
  twoFactorURL,
} from './helpers.js';

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

  const clearSessions = (email: string) =>
    booted.payload.db.updateOne({
      collection: usersSlug,
      where: { email: { equals: email } },
      data: { sessions: [] },
    });

  const graphql = async (query: string) => {
    const response = await GRAPHQL_POST(config)(
      new Request('http://localhost/api/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      }),
    );

    return response.text();
  };

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

    expect(after.status).not.toBe(200);
  });

  it('a terms hook that pauses and resumes with finishSignIn does not skip the code', async () => {
    await t.createUser('terms@example.com', { terms: true });
    await t.enable('terms@example.com');
    await clearSessions('terms@example.com');

    const paused = await t.providerSignIn('terms@example.com');
    const location = paused.headers.get('location') ?? '';

    expect(location).toMatch(/^\/terms\?id=/);

    const id = new URL(location, 'http://x').searchParams.get('id')!;
    const resumed = await t.request(`/api/${usersSlug}/terms/accept?id=${id}`, { method: 'POST' });

    expect(t.cookie(resumed, tokenCookieName)).toBeUndefined();
    expect(await t.sessions('terms@example.com')).toHaveLength(0);
  });

  it('a terms hook resumed for a user without two-factor still signs in', async () => {
    await t.createUser('plain-terms@example.com', { terms: true });

    const paused = await t.providerSignIn('plain-terms@example.com');
    const id = new URL(paused.headers.get('location')!, 'http://x').searchParams.get('id')!;
    const resumed = await t.request(`/api/${usersSlug}/terms/accept?id=${id}`, { method: 'POST' });

    expect(t.cookie(resumed, tokenCookieName)).toBeDefined();
    expect(await t.sessions('plain-terms@example.com')).toHaveLength(1);
  });

  it("canReset cannot reset a user the admin's own read and update access excludes", async () => {
    await t.createUser('admin-a@example.com', { tenant: 'a', role: 'admin' });
    await t.createUser('victim-b@example.com', { tenant: 'b' });
    await t.enable('victim-b@example.com');

    policy.requireAdmins = false;
    const adminToken = await t.token('admin-a@example.com');
    const victim = await t.user('victim-b@example.com');
    const visible = await t.request(`/api/${usersSlug}/${victim.id}`, {
      headers: t.auth(adminToken),
    });

    expect(visible.status).toBe(404);

    const reset = await t.json(`${twoFactorURL}/reset`, { id: victim.id }, t.auth(adminToken));

    expect(reset.status).toBe(404);
    expect((await t.user('victim-b@example.com')).twoFactorEnabled).toBe(true);
  });

  it('canReset is given the user to reset', async () => {
    await t.createUser('admin@example.com', { role: 'admin' });
    await t.createUser('owner@example.com', { role: 'owner' });
    await t.enable('owner@example.com');

    policy.requireAdmins = false;
    const adminToken = await t.token('admin@example.com');
    const owner = await t.user('owner@example.com');
    const reset = await t.json(`${twoFactorURL}/reset`, { id: owner.id }, t.auth(adminToken));

    expect(reset.status).toBe(403);
    expect((await t.user('owner@example.com')).twoFactorEnabled).toBe(true);
  });

  it('a setup confirmed before an admin reset cannot continue to a session', async () => {
    await t.createUser('admin@example.com', { role: 'admin', noTwoFactor: false });
    await t.createUser('boss@example.com', { role: 'admin' });

    const paused = await t.login('boss@example.com', { returnTo: '/admin' });

    expect(paused.status).toBe(202);

    const pending = t.cookie(paused, pendingCookieName)!;
    const setup = (await (
      await t.request(twoFactorURL, { headers: { accept: 'application/json', cookie: pending } })
    ).json()) as { secret: string };

    const confirmed = await t.form(
      `${twoFactorURL}/setup`,
      { code: codeNow(setup.secret) },
      pending,
    );

    expect(confirmed.status).toBe(200);

    policy.requireAdmins = false;
    const adminToken = await t.token('admin@example.com');
    policy.requireAdmins = true;
    const boss = await t.user('boss@example.com');
    const reset = await t.json(`${twoFactorURL}/reset`, { id: boss.id }, t.auth(adminToken));

    expect(reset.status).toBe(200);

    const continued = await t.form(`${twoFactorURL}/continue`, {}, pending);

    expect(t.cookie(continued, tokenCookieName)).toBeUndefined();
    expect(await t.sessions('boss@example.com')).toHaveLength(0);
  });

  it('Local API resetPassword saves the new password for a two-factor user and gives no token', async () => {
    await t.createUser('local@example.com');
    await t.enable('local@example.com');
    const token = await booted.frogbot.forgotPassword({
      collection: usersSlug,
      data: { email: 'local@example.com' },
      disableEmail: true,
    });

    await clearSessions('local@example.com');

    const result = await booted.frogbot.resetPassword({
      collection: usersSlug,
      data: { token, password: 'brand-new-password' },
      overrideAccess: true,
    });

    expect(result.token).toBeUndefined();
    expect(await t.sessions('local@example.com')).toHaveLength(0);

    const relogin = await t.json(`/api/${usersSlug}/login`, {
      email: 'local@example.com',
      password: 'brand-new-password',
    });

    expect(relogin.status).toBe(202);
  });

  it('GraphQL resetPassword saves the new password for a two-factor user and gives no token', async () => {
    await t.createUser('gql@example.com');
    await t.enable('gql@example.com');
    const token = await booted.frogbot.forgotPassword({
      collection: usersSlug,
      data: { email: 'gql@example.com' },
      disableEmail: true,
    });

    await clearSessions('gql@example.com');

    const body = await graphql(
      `mutation { resetPasswordUser(token: "${token}", password: "brand-new-password") { token } }`,
    );

    expect(body).not.toMatch(/"errors"|"token":"[^"]+"/);
    expect(await t.sessions('gql@example.com')).toHaveLength(0);

    const relogin = await t.json(`/api/${usersSlug}/login`, {
      email: 'gql@example.com',
      password: 'brand-new-password',
    });

    expect(relogin.status).toBe(202);
  });

  it('a failed GraphQL resetPassword does not let a later login in the same request skip the code', async () => {
    await t.createUser('gql-skip@example.com');
    await t.enable('gql-skip@example.com');

    const body = await graphql(
      `mutation { a: resetPasswordUser(token: "bad", password: "whatever-pass") { token } b: loginUser(email: "gql-skip@example.com", password: "${password}") { token } }`,
    );

    expect(body).not.toMatch(/"token":"[^"]+"/);
  });

  it('a failed Local API resetPassword does not let a login with the same context skip the code', async () => {
    await t.createUser('local-skip@example.com');
    await t.enable('local-skip@example.com');
    const context: Record<string, unknown> = {};

    await expect(
      booted.payload.resetPassword({
        collection: usersSlug,
        data: { token: 'bad', password: 'whatever-pass' },
        overrideAccess: true,
        context,
      }),
    ).rejects.toThrow();

    await expect(
      booted.payload.login({
        collection: usersSlug,
        data: { email: 'local-skip@example.com', password },
        context,
      }),
    ).rejects.toThrow(/Two-factor/);
  });
});
