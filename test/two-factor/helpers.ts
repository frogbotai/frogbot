import { Secret, TOTP } from 'otpauth';
import type { Payload } from 'payload';
import { vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { methodSlug, usersSlug } from './config.js';

export const password = 'two-factor-test-password';

export const pendingCookieName = 'frogbot-two-factor';

export const tokenCookieName = 'frogbot-token';

export const twoFactorURL = `/api/${usersSlug}/two-factor`;

export type StoredUser = {
  id: string | number;
  email: string;
  twoFactorEnabled?: boolean | null;
  twoFactorSecret?: string | null;
  twoFactorRecovery?: string[] | null;
  twoFactorLastStep?: number | null;
  sessions?: { id: string }[] | null;
};

const step = () => Math.floor(Date.now() / 30_000);

const codeAt = (secret: string, at: number) =>
  new TOTP({ secret: Secret.fromBase32(secret) }).generate({ timestamp: at * 30_000 });

export function createHarness(booted: () => BootedFrogBot) {
  const payload = (): Payload => booted().payload;

  const request = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, booted().baseUrl), { ...init, redirect: 'manual' });

  const json = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  const form = (path: string, body: Record<string, string>, cookie: string) =>
    request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams(body).toString(),
    });

  const cookies = (response: Response) => response.headers.getSetCookie();

  const cookie = (response: Response, name: string) => {
    const found = cookies(response).find((value) => value.startsWith(`${name}=`));

    return found && !/Max-Age=0/.test(found) ? found.split(';')[0] : undefined;
  };

  const user = async (email: string) =>
    (await payload().db.findOne<StoredUser>({
      collection: usersSlug,
      where: { email: { equals: email } },
    }))!;

  const sessions = async (email: string) => (await user(email)).sessions ?? [];

  const createUser = async (email: string, data: Record<string, unknown> = {}) => {
    await booted().frogbot.create({
      collection: usersSlug,
      data: { email, password, ...data },
      overrideAccess: true,
    });

    return user(email);
  };

  const nextCode = async (email: string, secret: string) => {
    const { id, twoFactorLastStep } = await user(email);
    const now = step();
    const next = Math.max((twoFactorLastStep ?? -1) + 1, now);

    if (next <= now + 1) return codeAt(secret, next);

    await payload().db.updateOne({
      collection: usersSlug,
      id,
      data: { twoFactorLastStep: null },
      returning: false,
    });

    return codeAt(secret, now);
  };

  const login = (email: string, body: Record<string, unknown> = {}) =>
    json(`/api/${usersSlug}/login`, { email, password, ...body });

  const token = async (email: string) => {
    const response = await login(email);
    const body = (await response.json()) as { token?: string };

    if (!body.token) throw new Error(`login for ${email} gave ${response.status}`);

    return body.token;
  };

  const auth = (value: string) => ({ authorization: `JWT ${value}` });

  const providerSignIn = async (email: string, returnTo = '/admin') => {
    const started = await request(
      `/api/${usersSlug}/sign-in/${methodSlug}?returnTo=${encodeURIComponent(returnTo)}`,
    );

    const authorize = new URL(started.headers.get('location')!);
    const callback = new URL(authorize.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', authorize.searchParams.get('state')!);
    callback.searchParams.set('code', email);

    return request(callback.pathname + callback.search, {
      headers: { cookie: started.headers.get('set-cookie')!.split(';')[0] },
    });
  };

  const enable = async (email: string) => {
    const signedIn = await token(email);
    const started = await json(`${twoFactorURL}/enable/start`, {}, auth(signedIn));
    const start = (await started.json()) as { secret: string };

    if (!start.secret) {
      throw new Error(`enable/start for ${email} gave ${started.status}: ${JSON.stringify(start)}`);
    }

    const enabled = await json(
      `${twoFactorURL}/enable`,
      { code: codeAt(start.secret, step()) },
      auth(signedIn),
    );

    const { recoveryCodes } = (await enabled.json()) as { recoveryCodes?: string[] };

    if (!recoveryCodes) throw new Error(`enable for ${email} gave ${enabled.status}`);

    return { secret: start.secret, recoveryCodes, token: signedIn };
  };

  const emails = () => {
    const spy = vi.mocked(booted().frogbot.email.sendEmail);

    return spy.mock.calls.map(([message]) => ({
      to: String(message.to),
      subject: String(message.subject),
    }));
  };

  return {
    auth,
    emails,
    cookie,
    cookies,
    createUser,
    enable,
    form,
    json,
    login,
    nextCode,
    providerSignIn,
    request,
    sessions,
    token,
    user,
  };
}
