import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { serve } from '@hono/node-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { FrogBot } from '../../packages/frogbot/src/frogbot.js';
import { definePiece } from '../../packages/frogbot/src/pieces/definePiece.js';
import type { OAuthTokens, PieceOAuthSave } from '../../packages/frogbot/src/pieces/types.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

const planAuth = z.object({ token: z.string().startsWith('plan-'), account: z.string() });

describe(`piece-run OAuth sign-in [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBot;
  let server: ReturnType<typeof serve>;
  let baseURL: string;
  let users: { id: number | string; authorization: string }[];

  const started: { returnTo: string; save: PieceOAuthSave }[] = [];
  const revoked: OAuthTokens[] = [];
  let revokeFails = false;

  const piece = definePiece({
    slug: 'planned',
    label: 'Planned',
    auth: z.object({ token: z.string().startsWith('key-') }),
    client: ({ auth }: { auth: unknown }) => ({ auth }),
    oauth: {
      scopes: { catalog: { plan: 'plan.use' }, defaults: [], required: ['plan'] },
      auth: planAuth,
      toAuth: ({ tokens }) => ({
        token: `plan-${tokens.access_token}`,
        account: String(tokens.account_hint),
      }),
      authorize: ({ returnTo, save }) => {
        started.push({ returnTo, save });

        return Promise.resolve('http://127.0.0.1:9/provider/authorize');
      },
      refresh: ({ tokens }) => Promise.resolve(tokens),
      revoke: ({ tokens }) => {
        revoked.push(tokens);

        return revokeFails ? Promise.reject(new Error('provider down')) : Promise.resolve();
      },
      label: 'Planned plan',
    },
    actions: [],
  })();

  const request = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, baseURL), { ...init, redirect: 'manual' });

  const authorize = async (authorization: string) => {
    const response = await request(
      `/rest/v1/connections/planned/authorize?returnTo=${encodeURIComponent('/control/settings/connections')}`,
      { headers: { authorization } },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://127.0.0.1:9/provider/authorize');

    return started.at(-1)!;
  };

  const tokens = (access: string): OAuthTokens => ({
    access_token: access,
    refresh_token: `refresh-${access}`,
    expires_in: 3600,
    scope: 'openid plan.use',
    account_hint: access,
  });

  const rows = () =>
    frogbot
      .find({ collection: 'connections', overrideAccess: true, depth: 0 })
      .then(({ docs }) => docs);

  const userRequest = (id: number | string) =>
    frogbot.createRequest({ user: { id, collection: 'users' } });

  beforeAll(async () => {
    baseURL = await new Promise<string>((resolve) => {
      server = serve(
        { fetch: (req) => frogbot.handleRequest(req.clone()), port: 0, hostname: '127.0.0.1' },
        (address) => resolve(`http://127.0.0.1:${address.port}`),
      );
    });

    const config = await buildConfig({
      secret: 'piece-sign-in-test-secret',
      routes: { api: '/rest/v1', admin: '/control' },
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({ client: { url: 'file::memory:' } }),
      }),
      admin: { user: 'users', importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      collections: [{ slug: 'users', auth: true, fields: [] }],
      connections: [{ piece, oauth: true, secret: true }],
    });

    frogbot = await new FrogBot().init({ config, disableOnInit: true });

    users = [];

    for (const email of ['first@example.com', 'second@example.com']) {
      const user = await frogbot.create({
        collection: 'users',
        data: { email, password: 'test-password' },
        overrideAccess: true,
      });

      const login = await request('/rest/v1/users/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'test-password' }),
      });

      users.push({ id: user.id, authorization: `JWT ${(await login.json()).token}` });
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );

    await frogbot?.destroy();
  });

  beforeEach(async () => {
    await frogbot.delete({ collection: 'connections', where: {}, overrideAccess: true });
    started.length = 0;
    revoked.length = 0;
    revokeFails = false;
  });

  it('boots with no OAuth app and hands authorize an absolute returnTo at the request origin', async () => {
    const { returnTo } = await authorize(users[0].authorization);

    expect(returnTo).toBe(`${baseURL}/control/settings/connections`);
  });

  it('saves an encrypted row for the user who clicked, and only that user', async () => {
    const { save } = await authorize(users[0].authorization);

    await save({
      tokens: tokens('first-token'),
      account: { id: 'sub-1', label: 'first@chat.test', email: 'first@chat.test' },
    });

    const [row] = await rows();

    expect(String(row.owner)).toBe(String(users[0].id));
    expect(row).toMatchObject({
      piece: 'planned',
      method: 'oauth',
      status: 'active',
      scopes: ['openid', 'plan.use'],
      account: { id: 'sub-1', label: 'first@chat.test', email: 'first@chat.test' },
    });
    expect(JSON.stringify(row)).not.toContain('first-token');

    await expect(
      frogbot.connections.resolve({ piece, req: await userRequest(users[0].id) }),
    ).resolves.toEqual({ token: 'plan-first-token', account: 'first-token' });
    await expect(
      frogbot.connections.resolve({ piece, req: await userRequest(users[1].id) }),
    ).rejects.toMatchObject({ code: 'missing' });
  });

  it('refuses a save without the required scope, so a later call fails its scope check', async () => {
    const { save } = await authorize(users[0].authorization);

    await save({
      tokens: { ...tokens('narrow'), scope: 'openid' },
      account: { id: 'sub-1', label: 'Narrow' },
    });

    await expect(
      frogbot.connections.resolve({ piece, req: await userRequest(users[0].id) }),
    ).rejects.toMatchObject({ code: 'scopes', missingScopes: ['plan.use'] });
  });

  it.each([false, true])(
    'revokes on disconnect, then deletes the row (revoke fails: %s)',
    async (fails) => {
      const { save } = await authorize(users[0].authorization);

      await save({ tokens: tokens('to-revoke'), account: { id: 'sub-1', label: 'Account' } });
      revokeFails = fails;

      const [row] = await rows();
      const response = await request(`/rest/v1/connections/${row.id}`, {
        method: 'DELETE',
        headers: { authorization: users[0].authorization },
      });

      expect(response.status).toBe(204);
      expect(revoked).toEqual([tokens('to-revoke')]);
      expect(await rows()).toEqual([]);
    },
  );
});
