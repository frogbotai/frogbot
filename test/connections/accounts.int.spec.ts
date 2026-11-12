import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { serve } from '@hono/node-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import type { ConnectionOwner } from '../../packages/frogbot/src/connections/store.js';
import { FrogBot } from '../../packages/frogbot/src/frogbot.js';
import { definePiece } from '../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceOAuthRecipe } from '../../packages/frogbot/src/pieces/types.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';
import { startFakeProvider } from './fakeProvider.js';

const auth = z.object({ apiKey: z.string().min(1) });

type Auth = z.output<typeof auth>;

const accountPiece = (providerURL: string, slug: string) =>
  definePiece({
    slug,
    label: slug,
    auth,
    client: ({ auth: value }: { auth: unknown }) => ({ auth: auth.parse(value) }),
    oauth: {
      authorizationUrl: `${providerURL}/authorize`,
      tokenUrl: `${providerURL}/token`,
      scopes: { catalog: { read: 'read' }, defaults: ['read'] },
      toAuth: ({ tokens }) => ({ apiKey: tokens.access_token ?? '' }),
      account: ({ client }) =>
        Promise.resolve({ id: client.auth.apiKey, label: `${client.auth.apiKey}@example.com` }),
    } satisfies PieceOAuthRecipe<Auth, { auth: Auth }>,
    actions: [],
  })({ oauth: { clientId: 'client-id', clientSecret: 'client-secret' } });

describe(`several accounts per piece [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBot;
  let server: ReturnType<typeof serve>;
  let provider: Awaited<ReturnType<typeof startFakeProvider>>;
  let baseURL: string;
  let mail: ReturnType<typeof accountPiece>;
  let other: ReturnType<typeof accountPiece>;
  const users: (ConnectionOwner & { authorization: string })[] = [];

  const request = (path: string, init: RequestInit = {}) =>
    fetch(new URL(`/rest/v1/connections${path}`, baseURL), { ...init, redirect: 'manual' });

  const req = (user = users[0]) =>
    frogbot.createRequest({ user: { id: user.id, collection: user.collection } });

  const rows = async (user = users[0], piece = 'mail') =>
    (await frogbot.connections.list({ req: await req(user) })).filter((row) => row.piece === piece);

  const link = async (
    code: string,
    {
      user = users[0],
      piece = 'mail',
      reconnect,
    }: {
      user?: (typeof users)[number];
      piece?: string;
      reconnect?: number | string;
    } = {},
  ) => {
    const started = await request(
      `/${piece}/authorize${reconnect === undefined ? '' : `?reconnect=${reconnect}`}`,
      { headers: { authorization: user.authorization } },
    );

    if (started.status !== 302) return started;
    const url = new URL(started.headers.get('location')!);
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', url.searchParams.get('state')!);
    callback.searchParams.set('code', code);

    return request(callback.pathname.replace('/rest/v1/connections', '') + callback.search, {
      headers: { cookie: started.headers.get('set-cookie')!.split(';')[0] },
    });
  };

  const linked = async (code: string, options?: Parameters<typeof link>[1]) => {
    expect((await link(code, options)).status).toBe(302);

    return (await rows(options?.user, options?.piece)).find(
      (row) => row.accountId === `fresh-${code}`,
    )!;
  };

  const resolve = async (connection?: number | string, piece = mail, user = users[0]) =>
    frogbot.connections.resolve({
      piece,
      req: await req(user),
      ...(connection === undefined ? {} : { connection }),
    });

  beforeAll(async () => {
    provider = await startFakeProvider();
    mail = accountPiece(provider.url, 'mail');
    other = accountPiece(provider.url, 'other');

    baseURL = await new Promise<string>((done) => {
      server = serve(
        { fetch: (r) => frogbot.handleRequest(r.clone()), port: 0, hostname: '127.0.0.1' },
        (address) => done(`http://127.0.0.1:${address.port}`),
      );
    });

    const config = await buildConfig({
      secret: 'several-accounts-test-secret',
      serverURL: baseURL,
      routes: { api: '/rest/v1', admin: '/control' },
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({ client: { url: 'file::memory:' } }),
      }),
      admin: { user: 'users', importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      collections: [{ slug: 'users', auth: true, fields: [] }],
      connections: [
        { piece: mail, oauth: true, secret: true },
        { piece: other, oauth: true },
      ],
    });

    frogbot = await new FrogBot().init({ config, disableOnInit: true });

    for (const email of ['first@example.com', 'second@example.com']) {
      const user = await frogbot.create({
        collection: 'users',
        data: { email, password: 'test-password' },
        overrideAccess: true,
      });

      const login = await fetch(new URL('/rest/v1/users/login', baseURL), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'test-password' }),
      });

      users.push({
        id: user.id,
        collection: 'users',
        authorization: `JWT ${(await login.json()).token}`,
      });
    }
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((done, fail) => server.close((e) => (e ? fail(e) : done())));
    }

    await provider?.close();
    await frogbot?.destroy();
  });

  beforeEach(async () => {
    await frogbot.delete({ collection: 'connections', where: {}, overrideAccess: true });
  });

  it('adds a row per provider account, makes the first the default and keeps ids on relink', async () => {
    const first = await linked('a');
    const second = await linked('b');

    expect(first).toMatchObject({ accountId: 'fresh-a', isDefault: true });
    expect(second).toMatchObject({ accountId: 'fresh-b', isDefault: false });
    expect(second.id).not.toBe(first.id);

    const again = await linked('a');

    expect(again).toMatchObject({ id: first.id, isDefault: true });
    expect(await rows()).toHaveLength(2);
  });

  it('resolves the only account, then the default, then a pinned account', async () => {
    const first = await linked('a');

    await expect(resolve()).resolves.toEqual({ apiKey: 'fresh-a' });

    const second = await linked('b');

    await expect(resolve()).resolves.toEqual({ apiKey: 'fresh-a' });
    await expect(resolve(second.id)).resolves.toEqual({ apiKey: 'fresh-b' });
    await expect(resolve(String(first.id))).resolves.toEqual({ apiKey: 'fresh-a' });
  });

  it('gives each account its own cached client', async () => {
    await linked('a');
    const second = await linked('b');
    const request = await req();
    const byDefault = await mail.client({ req: request });
    const pinned = await mail.client({ req: request, connection: second.id });

    expect(byDefault).toEqual({ auth: { apiKey: 'fresh-a' } });
    expect(pinned).toEqual({ auth: { apiKey: 'fresh-b' } });
    expect(pinned).not.toBe(byDefault);
    expect(await mail.client({ req: request })).toBe(byDefault);
    expect(await mail.client({ req: request, connection: second.id })).toBe(pinned);
  });

  it('throws missing with no account and lists an authorize prompt', async () => {
    await expect(resolve()).rejects.toMatchObject({ name: 'ConnectionError', code: 'missing' });
    expect(
      await frogbot.connections.authorizations({ pieces: [mail], req: await req() }),
    ).toMatchObject([{ piece: 'mail', oauth: true, secret: true }]);
  });

  it('throws ambiguous with several accounts and no default, in resolution and authorizations', async () => {
    const first = await linked('a');
    await linked('b');

    await frogbot.update({
      collection: 'connections',
      id: first.id,
      data: { isDefault: false },
      overrideAccess: true,
    });

    await expect(resolve()).rejects.toMatchObject({ name: 'ConnectionError', code: 'ambiguous' });
    await expect(
      frogbot.connections.authorizations({ pieces: [mail], req: await req() }),
    ).rejects.toMatchObject({ code: 'ambiguous' });
  });

  it("forbids another user's account, another piece's account and an unknown id", async () => {
    await linked('a');
    const theirs = await linked('b', { user: users[1] });
    const otherPiece = await linked('c', { piece: 'other' });

    for (const id of [theirs.id, otherPiece.id, '999999', 'not-an-id']) {
      await expect(resolve(id)).rejects.toMatchObject({ code: 'forbidden', piece: 'mail' });
      await expect(mail.client({ req: await req(), connection: id })).rejects.toMatchObject({
        code: 'forbidden',
      });
    }
  });

  it("sets the default through POST /:id/default and refuses another user's row", async () => {
    const first = await linked('a');
    const second = await linked('b');
    const setDefault = (id: number | string, user = users[0]) =>
      request(`/${id}/default`, { method: 'POST', headers: { authorization: user.authorization } });

    expect((await setDefault(second.id, users[1])).status).toBe(404);
    expect((await setDefault('999999')).status).toBe(404);
    expect((await rows()).map((row) => row.isDefault)).toEqual([true, false]);

    const response = await setDefault(second.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: second.id, isDefault: true });
    expect((await rows()).map((row) => [row.id, row.isDefault])).toEqual([
      [first.id, false],
      [second.id, true],
    ]);
    await expect(resolve()).resolves.toEqual({ apiKey: 'fresh-b' });
    expect((await setDefault(second.id)).status).toBe(200);
    expect((await rows()).filter((row) => row.isDefault)).toHaveLength(1);
  });

  it('promotes the oldest remaining account when the default is disconnected', async () => {
    const first = await linked('a');
    const second = await linked('b');
    const third = await linked('c');
    const disconnect = (id: number | string) =>
      request(`/${id}`, { method: 'DELETE', headers: { authorization: users[0].authorization } });

    await frogbot.connections.setDefault({ req: await req(), id: third.id });

    expect((await disconnect(third.id)).status).toBe(204);
    expect((await rows()).map((row) => [row.id, row.isDefault])).toEqual([
      [first.id, true],
      [second.id, false],
    ]);
    expect((await disconnect(second.id)).status).toBe(204);
    expect((await rows()).map((row) => [row.id, row.isDefault])).toEqual([[first.id, true]]);
    expect((await disconnect(first.id)).status).toBe(204);
    expect(await rows()).toEqual([]);
  });

  it('reconnects onto the chosen row and refuses a different account without writing', async () => {
    const first = await linked('a');
    const second = await linked('b');
    const before = await rows();

    const wrong = await link('b', { reconnect: first.id });

    expect(wrong.status).toBe(400);
    expect(await rows()).toEqual(before);

    expect((await link('a', { reconnect: first.id })).status).toBe(302);
    expect((await rows()).map((row) => row.id)).toEqual([first.id, second.id]);

    for (const options of [
      { reconnect: first.id, user: users[1] },
      { reconnect: first.id, piece: 'other' },
      { reconnect: '999999' },
    ]) {
      expect((await link('a', options)).status).toBe(404);
    }
  });

  it('keeps one API key per piece, replaced in place', async () => {
    const save = async (apiKey: string) => {
      const response = await request('/mail', {
        method: 'POST',
        headers: { authorization: users[0].authorization, 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });

      expect(response.status).toBe(200);

      return response.json();
    };

    const first = await save('key-one');
    const second = await save('key-two');

    expect(second).toMatchObject({ id: first.id, accountId: '', isDefault: true });
    expect(await rows()).toHaveLength(1);
    await expect(resolve()).resolves.toEqual({ apiKey: 'key-two' });
  });

  it('leaves exactly one default after concurrent set-default, link and disconnect', async () => {
    const first = await linked('a');
    const second = await linked('b');
    const store = await frogbot.connections.store;
    const owner = { id: users[0].id, collection: 'users' };
    const account = (id: string) => ({
      owner,
      piece: 'mail',
      method: 'oauth' as const,
      credential: { access_token: id },
      account: { id, label: id },
      scopes: ['read'],
    });

    for (let round = 0; round < 3; round++) {
      const results = await Promise.allSettled([
        frogbot.connections.setDefault({ req: await req(), id: second.id }),
        store.upsert(account(`race-${round}-1`)),
        frogbot.connections.setDefault({ req: await req(), id: first.id }),
        store.upsert(account(`race-${round}-2`)),
      ]);

      expect(results.some((result) => result.status === 'fulfilled')).toBe(true);

      for (const result of results) {
        if (result.status === 'rejected') {
          expect((result.reason as Error).name).toBe('KVLockContentionError');
        }
      }

      expect((await rows()).filter((row) => row.isDefault)).toHaveLength(1);
    }
  });

  describe('a row saved before accountId existed', () => {
    const legacy = async () => {
      const row = await linked('a');

      await frogbot.update({
        collection: 'connections',
        id: row.id,
        data: { accountId: '' },
        overrideAccess: true,
      });

      return row;
    };

    it('still refreshes', async () => {
      const row = await legacy();

      await frogbot.update({
        collection: 'connections',
        id: row.id,
        data: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
        overrideAccess: true,
      });

      await expect(resolve()).resolves.toEqual({ apiKey: 'fresh-null' });
      expect((await rows()).map((r) => [r.id, r.accountId])).toEqual([[row.id, 'fresh-a']]);
    });

    it('relinks onto the same row', async () => {
      const row = await legacy();

      expect((await link('a')).status).toBe(302);
      expect((await rows()).map((r) => [r.id, r.isDefault])).toEqual([[row.id, true]]);
    });

    it('reconnects', async () => {
      const row = await legacy();

      expect((await link('a', { reconnect: row.id })).status).toBe(302);
      expect((await rows()).map((r) => r.id)).toEqual([row.id]);
    });
  });
});
