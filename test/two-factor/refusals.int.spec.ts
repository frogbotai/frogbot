import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { policy, stopProvider } from './config.js';
import { createHarness, pendingCookieName, twoFactorURL } from './helpers.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const CODE_MISSING = 'Send the code as a string in `code`, e.g. {"code":"123456"}.';

const codes: Record<string, string> = {
  wrong_code: 'two-factor.wrong-code',
  locked: 'two-factor.locked',
  expired: 'two-factor.expired',
  pending_missing: 'two-factor.pending-missing',
  code_missing: 'two-factor.code-missing',
  body_unreadable: 'two-factor.body-unreadable',
};

const refusal = (message: string, code: string) =>
  expect.objectContaining({ code: codes[code] ?? code, detail: message });

describe('two-factor refusals', () => {
  let booted: BootedFrogBot;
  const t = createHarness(() => booted);

  const pendingFor = async (email: string) => t.cookie(await t.login(email), pendingCookieName)!;

  const raw = (cookie: string, contentType: string, body: string) =>
    t.request(`${twoFactorURL}/verify`, {
      method: 'POST',
      headers: { 'content-type': contentType, cookie },
      body,
    });

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'two-factor-refusals');
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

  it('accepts the right code sent as a JSON number', async () => {
    await t.createUser('number@example.com');
    const { secret } = await t.enable('number@example.com');
    const cookie = await pendingFor('number@example.com');
    const code = Number(await t.nextCode('number@example.com', secret));

    const response = await t.json(`${twoFactorURL}/verify`, { code }, { cookie });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { token?: string }).token).toEqual(expect.any(String));
  });

  it('refuses a missing or mistyped code with code_missing and never counts it toward the lock', async () => {
    await t.createUser('shape@example.com');
    const { secret } = await t.enable('shape@example.com');
    const cookie = await pendingFor('shape@example.com');

    for (const body of [
      {},
      { code: '' },
      { code: true },
      { code: 12.5 },
      { code: 1_234_567 },
      { code: ['123456'] },
    ]) {
      const response = await t.json(`${twoFactorURL}/verify`, body, { cookie });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(refusal(CODE_MISSING, 'code_missing'));
    }

    const response = await t.json(
      `${twoFactorURL}/verify`,
      { code: await t.nextCode('shape@example.com', secret) },
      { cookie },
    );

    expect(response.status).toBe(200);
  });

  it('refuses an unreadable body with body_unreadable and never counts it toward the lock', async () => {
    await t.createUser('unreadable@example.com');
    const { secret } = await t.enable('unreadable@example.com');
    const cookie = await pendingFor('unreadable@example.com');

    for (const [type, body] of [
      ['application/json', '{"code": "123'],
      ['application/json', '"123456"'],
      ['text/plain', '123456'],
      ['text/plain', '123456'],
      ['text/plain', '123456'],
      ['text/plain', '123456'],
    ]) {
      const response = await raw(cookie, type, body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(
        refusal('Send JSON or a URL-encoded form body, e.g. {"code":"123456"}.', 'body_unreadable'),
      );
    }

    const response = await t.json(
      `${twoFactorURL}/verify`,
      { code: await t.nextCode('unreadable@example.com', secret) },
      { cookie },
    );

    expect(response.status).toBe(200);
  });

  it('codes a wrong code and the lock, and sends Retry-After with the lock', async () => {
    await t.createUser('locked@example.com');
    const { secret } = await t.enable('locked@example.com');
    const cookie = await pendingFor('locked@example.com');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await t.json(`${twoFactorURL}/verify`, { code: '000000' }, { cookie });

      expect(wrong.status).toBe(401);
      expect(await wrong.json()).toEqual(refusal("That code didn't work.", 'wrong_code'));
    }

    const locked = await t.json(
      `${twoFactorURL}/verify`,
      { code: await t.nextCode('locked@example.com', secret) },
      { cookie },
    );

    const retryAfter = Number(locked.headers.get('retry-after'));

    expect(locked.status).toBe(429);
    expect(await locked.json()).toEqual(
      refusal('Too many wrong codes. Try again in 10 minutes.', 'locked'),
    );
    expect(retryAfter).toBeGreaterThan(590);
    expect(retryAfter).toBeLessThanOrEqual(600);
  });

  it('tells a request without the pending cookie to send it, apart from an expired sign-in', async () => {
    const missing = await t.json(`${twoFactorURL}/verify`, { code: '123456' });

    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual(
      refusal(
        'No pending sign-in: send the `frogbot-two-factor` cookie from the sign-in response, or sign in again.',
        'pending_missing',
      ),
    );

    const expired = await t.json(
      `${twoFactorURL}/verify`,
      { code: '123456' },
      { cookie: `${pendingCookieName}=gone` },
    );

    expect(expired.status).toBe(400);
    expect(await expired.json()).toEqual(
      refusal('This sign-in expired or was already used. Sign in again.', 'expired'),
    );
  });

  it('shows the code page, not the expired page, for a form post without a code', async () => {
    await t.createUser('form@example.com');
    await t.enable('form@example.com');
    const cookie = await pendingFor('form@example.com');

    const response = await t.form(`${twoFactorURL}/verify`, { code: '' }, cookie);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Enter the code from your authenticator app.');
  });

  it('refuses a mistyped code on the account endpoints without counting it', async () => {
    await t.createUser('account@example.com');
    const { secret, token } = await t.enable('account@example.com');

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await t.json(`${twoFactorURL}/disable`, { code: null }, t.auth(token));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(refusal(CODE_MISSING, 'code_missing'));
    }

    const disabled = await t.json(
      `${twoFactorURL}/recovery-codes`,
      { code: Number(await t.nextCode('account@example.com', secret)) },
      t.auth(token),
    );

    expect(disabled.status).toBe(200);
  });
});
