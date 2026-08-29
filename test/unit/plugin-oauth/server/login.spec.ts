import type { FrogbotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { loginFromOAuth } from '../../../../packages/plugins/plugin-oauth/src/server/login.js';

function request({
  useSessions = false,
  verify = false,
  maxLoginAttempts = 0,
  beforeLogin = [],
  afterLogin = [],
}: {
  useSessions?: boolean;
  verify?: boolean;
  maxLoginAttempts?: number;
  beforeLogin?: Array<ReturnType<typeof vi.fn>>;
  afterLogin?: Array<ReturnType<typeof vi.fn>>;
} = {}) {
  const updateOne = vi.fn().mockResolvedValue(undefined);
  const req = {
    context: {},
    payload: {
      secret: 'secret',
      config: { cookiePrefix: 'frogbot' },
      db: { updateOne },
      collections: {
        users: {
          config: {
            slug: 'users',
            fields: [],
            hooks: { beforeLogin, afterLogin },
            auth: {
              useSessions,
              verify,
              maxLoginAttempts,
              tokenExpiration: 7200,
              cookies: { sameSite: 'Lax', secure: false },
            },
          },
        },
      },
    },
  } as unknown as FrogbotRequest;
  return { req, updateOne };
}

describe('loginFromOAuth', () => {
  it('runs login hooks and returns a session cookie redirect', async () => {
    const order: string[] = [];
    const beforeLogin = vi.fn().mockImplementation(() => {
      order.push('before');
    });
    const afterLogin = vi.fn().mockImplementation(() => {
      order.push('after');
    });
    const { req } = request({ beforeLogin: [beforeLogin], afterLogin: [afterLogin] });
    const user = { id: 'user-1', email: 'user@example.com' };
    const result = await loginFromOAuth({
      req,
      user,
      collectionSlug: 'users',
      returnUrl: '/admin',
    });
    expect(order).toEqual(['before', 'after']);
    expect(req.user).toBe(user);
    expect(result.status).toBe(302);
    expect(result.headers.get('location')).toBe('/admin');
    expect(result.headers.get('set-cookie')).toContain('frogbot-token=');
    expect(afterLogin).toHaveBeenCalledWith(expect.objectContaining({ token: expect.any(String) }));
  });

  it.each([false, true])('honors useSessions=%s', async (useSessions) => {
    const { req, updateOne } = request({ useSessions });
    await loginFromOAuth({
      req,
      user: { id: 'user-1', email: 'user@example.com' },
      collectionSlug: 'users',
      returnUrl: '/',
    });
    expect(updateOne).toHaveBeenCalledTimes(useSessions ? 1 : 0);
  });

  it('rejects unverified users before hooks', async () => {
    const beforeLogin = vi.fn();
    const { req } = request({ verify: true, beforeLogin: [beforeLogin] });
    await expect(
      loginFromOAuth({
        req,
        user: { id: 'user-1', email: 'user@example.com', _verified: false },
        collectionSlug: 'users',
        returnUrl: '/',
      }),
    ).rejects.toThrow(/verify/i);
    expect(beforeLogin).not.toHaveBeenCalled();
  });

  it('rejects locked users before hooks', async () => {
    const beforeLogin = vi.fn();
    const { req } = request({ maxLoginAttempts: 5, beforeLogin: [beforeLogin] });
    await expect(
      loginFromOAuth({
        req,
        user: {
          id: 'user-1',
          email: 'user@example.com',
          lockUntil: new Date(Date.now() + 10000).toISOString(),
        },
        collectionSlug: 'users',
        returnUrl: '/',
      }),
    ).rejects.toThrow(/locked/i);
    expect(beforeLogin).not.toHaveBeenCalled();
  });
});
