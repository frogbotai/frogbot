import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { serve } from '@hono/node-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { ConnectionError } from '../../packages/frogbot/src/connections/api.js';
import type { ConnectionRow } from '../../packages/frogbot/src/connections/store.js';
import { FrogBot } from '../../packages/frogbot/src/frogbot.js';
import { definePiece } from '../../packages/frogbot/src/pieces/definePiece.js';
import type {
  OAuthTokens,
  PieceOAuthRecipe,
  PieceOAuthSave,
} from '../../packages/frogbot/src/pieces/types.js';
import type { FrogBotRequest } from '../../packages/frogbot/src/types/request.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

const mailAuth = z.object({ apiKey: z.string().min(1) });

type MailAuth = z.output<typeof mailAuth>;

describe(`app-owned connection slots [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBot;
  let server: ReturnType<typeof serve>;
  let provider: ReturnType<typeof serve>;
  let baseURL: string;
  let users: { id: number | string; authorization: string }[];
  let customerAuthorization: string;
  let mail: ReturnType<typeof mailPiece>;
  const requests: FrogBotRequest[] = [];
  const started: PieceOAuthSave[] = [];
  const revoked: OAuthTokens[] = [];

  const mailPiece = (providerURL: string) =>
    definePiece({
      slug: 'mail',
      label: 'Mail',
      auth: mailAuth,
      client: ({ auth }: { auth: unknown }) => mailAuth.parse(auth),
      oauth: {
        authorizationUrl: `${providerURL}/authorize`,
        tokenUrl: `${providerURL}/token`,
        scopes: { catalog: { send: 'send' }, defaults: ['send'] },
        toAuth: ({ tokens }) => ({ apiKey: tokens.access_token ?? '' }),
        account: ({ client }) =>
          Promise.resolve({ id: client.apiKey, label: `Mailbox ${client.apiKey}` }),
      } satisfies PieceOAuthRecipe<MailAuth, MailAuth>,
      actions: [
        {
          slug: 'whoami',
          input: z.object({}),
          run: ({ client, req }) => {
            requests.push(req);

            return Promise.resolve(client.apiKey);
          },
        },
      ],
    })({
      oauth: { clientId: 'client-id', clientSecret: 'client-secret' },
      auth: { apiKey: 'factory-fallback' },
    });

  const planned = definePiece({
    slug: 'planned',
    label: 'Planned',
    auth: z.object({ token: z.string() }),
    client: ({ auth }: { auth: unknown }) => ({ auth }),
    oauth: {
      scopes: { catalog: { plan: 'plan.use' }, defaults: [], required: ['plan'] },
      auth: z.object({ token: z.string() }),
      toAuth: ({ tokens }) => ({ token: String(tokens.access_token) }),
      authorize: ({ save }) => {
        started.push(save);

        return Promise.resolve('http://127.0.0.1:9/provider/authorize');
      },
      refresh: ({ tokens }) => Promise.resolve(tokens),
      revoke: ({ tokens }) => {
        revoked.push(tokens);

        return Promise.resolve();
      },
    },
    actions: [],
  })();

  const request = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, baseURL), { ...init, redirect: 'manual' });

  const rows = async () =>
    (
      await frogbot.find({
        collection: 'connections',
        overrideAccess: true,
        depth: 0,
        pagination: false,
      })
    ).docs as ConnectionRow[];

  const userRequest = (id: number | string) =>
    frogbot.createRequest({ user: { id, collection: 'users' } });

  const store = () => frogbot.connections.store;

  const linkSecret = async (holder: { app: string } | { owner: number | string }, apiKey: string) =>
    (await store()).upsert({
      ...('app' in holder ? holder : { owner: { id: holder.owner, collection: 'users' } }),
      piece: 'mail',
      method: 'secret',
      credential: { apiKey },
    });

  beforeAll(async () => {
    baseURL = await new Promise<string>((resolve) => {
      server = serve(
        { fetch: (req) => frogbot.handleRequest(req.clone()), port: 0, hostname: '127.0.0.1' },
        (address) => resolve(`http://127.0.0.1:${address.port}`),
      );
    });

    const providerURL = await new Promise<string>((resolve) => {
      provider = serve(
        {
          port: 0,
          hostname: '127.0.0.1',
          fetch: async (req) => {
            const params = new URLSearchParams(await req.text());

            return Response.json({ access_token: `fresh-${params.get('code')}`, scope: 'send' });
          },
        },
        (address) => resolve(`http://127.0.0.1:${address.port}`),
      );
    });

    mail = mailPiece(providerURL);

    const config = await buildConfig({
      secret: 'connection-slots-test-secret',
      serverURL: baseURL,
      routes: { api: '/rest/v1', admin: '/control' },
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({ client: { url: 'file::memory:' } }),
      }),
      admin: { user: 'users', importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'customers', auth: true, fields: [] },
      ],
      connections: [
        { piece: mail, oauth: true, secret: true },
        { piece: mail, oauth: true, secret: true, app: 'teamMailbox' },
        { piece: mail, secret: true, app: 'billing' },
        { piece: planned, oauth: true, app: 'shared' },
      ],
    });

    frogbot = await new FrogBot().init({ config, disableOnInit: true });

    const login = async (email: string, collection: string) => {
      const response = await request(`/rest/v1/${collection}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'test-password' }),
      });

      return `JWT ${(await response.json()).token}`;
    };

    users = [];

    for (const email of ['first@example.com', 'second@example.com']) {
      const user = await frogbot.create({
        collection: 'users',
        data: { email, password: 'test-password' },
        overrideAccess: true,
      });

      users.push({ id: user.id, authorization: await login(email, 'users') });
    }

    await frogbot.create({
      collection: 'customers',
      data: { email: 'customer@example.com', password: 'test-password' },
      overrideAccess: true,
    });

    customerAuthorization = await login('customer@example.com', 'customers');
  });

  afterAll(async () => {
    for (const listener of [server, provider]) {
      if (listener) {
        await new Promise<void>((resolve, reject) =>
          listener.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }

    await frogbot?.destroy();
  });

  beforeEach(async () => {
    await frogbot.delete({ collection: 'connections', where: {}, overrideAccess: true });
    requests.length = 0;
    started.length = 0;
    revoked.length = 0;
  });

  it('reads a slot with `as` for every user, keeps the request, and leaves user rows apart', async () => {
    await linkSecret({ app: 'teamMailbox' }, 'team');
    await linkSecret({ app: 'billing' }, 'billing');
    await linkSecret({ owner: users[0].id }, 'mine');

    const first = await userRequest(users[0].id);
    const second = await userRequest(users[1].id);

    await expect(mail.whoami({ input: {}, req: first, as: 'teamMailbox' })).resolves.toBe('team');
    await expect(mail.whoami({ input: {}, req: second, as: 'teamMailbox' })).resolves.toBe('team');
    await expect(mail.whoami({ input: {}, req: second, as: 'billing' })).resolves.toBe('billing');
    await expect(mail.whoami({ input: {}, req: first })).resolves.toBe('mine');
    await expect(mail.client({ req: second, as: 'teamMailbox' })).resolves.toEqual({
      apiKey: 'team',
    });

    expect(requests[0]).toBe(first);
    expect(requests[1]).toBe(second);
    expect((await rows()).map(({ owner, app }) => [owner ?? null, app])).toEqual(
      expect.arrayContaining([
        [null, 'teamMailbox'],
        [null, 'billing'],
        [users[0].id, ''],
      ]),
    );
  });

  it('throws missing for an unlinked slot, without the user row or the factory auth', async () => {
    await linkSecret({ owner: users[0].id }, 'mine');
    const req = await userRequest(users[0].id);

    const error = await mail.whoami({ input: {}, req, as: 'teamMailbox' }).catch((e) => e);

    expect(error).toBeInstanceOf(ConnectionError);
    expect(error).toMatchObject({ code: 'missing', piece: 'mail' });
    await expect(mail.whoami({ input: {}, req: await userRequest(users[1].id) })).resolves.toBe(
      'factory-fallback',
    );
  });

  it('lets the database keep one row per slot and per user, whatever writes it', async () => {
    const base = { piece: 'mail', method: 'secret', credential: 'x', scopes: [], status: 'active' };

    for (const data of [
      { ...base, app: 'teamMailbox' },
      { ...base, owner: users[0].id, app: '' },
    ]) {
      await frogbot.create({ collection: 'connections', data, overrideAccess: true });

      await expect(
        frogbot.create({ collection: 'connections', data, overrideAccess: true }),
      ).rejects.toThrow();
    }

    await frogbot.create({
      collection: 'connections',
      data: { ...base, app: 'billing' },
      overrideAccess: true,
    });

    await frogbot.create({
      collection: 'connections',
      data: { ...base, owner: users[1].id, app: '' },
      overrideAccess: true,
    });

    expect(await rows()).toHaveLength(4);
  });

  it('refuses a row that has both an owner and a slot name', async () => {
    const base = { piece: 'mail', method: 'secret', credential: 'x', scopes: [], status: 'active' };

    await frogbot.create({
      collection: 'connections',
      data: { ...base, app: 'teamMailbox' },
      overrideAccess: true,
    });

    await expect(
      frogbot.create({
        collection: 'connections',
        data: { ...base, owner: users[0].id, app: 'teamMailbox' },
        overrideAccess: true,
      }),
    ).rejects.toThrow();
  });

  it('never resolves a user-owned row as the slot', async () => {
    const own = await linkSecret({ owner: users[0].id }, 'mine');

    await frogbot
      .update({
        collection: 'connections',
        id: own.id,
        data: { owner: users[0].id, app: 'teamMailbox' },
        overrideAccess: true,
      })
      .catch(() => undefined);

    const error = await mail
      .whoami({ input: {}, req: await userRequest(users[1].id), as: 'teamMailbox' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ConnectionError);
    expect(error).toMatchObject({ code: 'missing' });
    expect(await frogbot.connections.slots({ req: await userRequest(users[1].id) })).toEqual([]);
  });

  it('throws a config error for an `as` no entry declares', async () => {
    const req = await userRequest(users[0].id);

    for (const as of ['nope', 'shared']) {
      const error = await mail.whoami({ input: {}, req, as }).catch((e) => e);

      expect(error).not.toBeInstanceOf(ConnectionError);
      expect(error.message).toContain(`'${as}'`);
    }
  });

  it('hides slot rows from REST and Local API reads', async () => {
    await linkSecret({ app: 'teamMailbox' }, 'team');
    const own = await linkSecret({ owner: users[0].id }, 'mine');

    const response = await request('/rest/v1/connections', {
      headers: { authorization: users[0].authorization },
    });

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.docs.map(({ id }: { id: unknown }) => id)).toEqual([own.id]);
    expect(JSON.stringify(body)).not.toContain('team');

    const local = await frogbot.find({
      collection: 'connections',
      user: { id: users[1].id, collection: 'users' },
      overrideAccess: false,
      showHiddenFields: true,
    });

    expect(local.docs).toEqual([]);
  });

  it('lists slots without credentials, for admin-collection users only', async () => {
    await linkSecret({ app: 'teamMailbox' }, 'team');

    const slots = await frogbot.connections.slots({ req: await userRequest(users[1].id) });

    expect(slots).toEqual([expect.objectContaining({ app: 'teamMailbox', piece: 'mail' })]);
    expect(slots[0]).not.toHaveProperty('credential');
    await expect(
      frogbot.connections.slots({
        req: await frogbot.createRequest({ user: { id: users[0].id, collection: 'customers' } }),
      }),
    ).rejects.toThrow();
  });

  it('links a slot by OAuth through the shared callback, and relinking replaces it', async () => {
    for (const code of ['first', 'second']) {
      const response = await request('/rest/v1/connections/app/teamMailbox/mail/authorize', {
        headers: { authorization: users[0].authorization },
      });

      expect(response.status).toBe(302);

      const url = new URL(response.headers.get('location')!);
      const callback = new URL(url.searchParams.get('redirect_uri')!);

      expect(callback.pathname).toBe('/rest/v1/connections/mail/callback');

      callback.searchParams.set('state', url.searchParams.get('state')!);
      callback.searchParams.set('code', code);

      const done = await request(callback.href, {
        headers: { cookie: response.headers.get('set-cookie')!.split(';')[0] },
      });

      expect(done.status).toBe(302);
    }

    const saved = await rows();

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ app: 'teamMailbox', method: 'oauth' });
    expect(saved[0].owner ?? null).toBeNull();
    expect(saved[0].account).toMatchObject({ label: 'Mailbox fresh-second' });
    await expect(
      mail.whoami({ input: {}, req: await userRequest(users[1].id), as: 'teamMailbox' }),
    ).resolves.toBe('fresh-second');
  });

  it('saves a secret slot and disconnects it', async () => {
    const path = '/rest/v1/connections/app/billing/mail';
    const saved = await request(path, {
      method: 'POST',
      headers: { authorization: users[1].authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'billing-key' }),
    });

    const metadata = await saved.json();

    expect(saved.status).toBe(200);
    expect(metadata).toMatchObject({ app: 'billing', piece: 'mail', method: 'secret' });
    expect(JSON.stringify(metadata)).not.toContain('billing-key');
    await expect(
      mail.whoami({ input: {}, req: await userRequest(users[0].id), as: 'billing' }),
    ).resolves.toBe('billing-key');

    const headers = { authorization: users[0].authorization };

    expect((await request(path, { method: 'DELETE', headers })).status).toBe(204);
    expect(await rows()).toEqual([]);
    expect((await request(path, { method: 'DELETE', headers })).status).toBe(404);
  });

  it('links a piece sign-in slot and revokes it at the provider on disconnect', async () => {
    const response = await request('/rest/v1/connections/app/shared/planned/authorize', {
      headers: { authorization: users[0].authorization },
    });

    expect(response.status).toBe(302);

    const tokens = { access_token: 'plan-token', scope: 'plan.use' };
    await started.at(-1)!({ tokens, account: { id: 'plan', label: 'Team plan' } });

    expect(await rows()).toEqual([
      expect.objectContaining({ app: 'shared', piece: 'planned', method: 'oauth' }),
    ]);

    const deleted = await request('/rest/v1/connections/app/shared/planned', {
      method: 'DELETE',
      headers: { authorization: users[1].authorization },
    });

    expect(deleted.status).toBe(204);
    expect(revoked).toEqual([expect.objectContaining({ access_token: 'plan-token' })]);
    expect(await rows()).toEqual([]);
  });

  it.each([
    ['GET', '/rest/v1/connections/app/teamMailbox/mail/authorize'],
    ['POST', '/rest/v1/connections/app/billing/mail'],
    ['DELETE', '/rest/v1/connections/app/billing/mail'],
  ])(
    'refuses %s %s with 401 without a user and 403 for another collection',
    async (method, path) => {
      await linkSecret({ app: 'billing' }, 'billing');
      const init = {
        method,
        ...(method === 'POST' ? { body: JSON.stringify({ apiKey: 'stolen' }) } : {}),
      };

      const json = { 'content-type': 'application/json' };

      expect((await request(path, { ...init, headers: json })).status).toBe(401);
      expect(
        (
          await request(path, {
            ...init,
            headers: { ...json, authorization: customerAuthorization },
          })
        ).status,
      ).toBe(403);
      await expect(
        mail.whoami({ input: {}, req: await userRequest(users[0].id), as: 'billing' }),
      ).resolves.toBe('billing');
    },
  );

  it('returns 404 for a slot or piece the config does not declare', async () => {
    const headers = { authorization: users[0].authorization };

    for (const path of [
      '/rest/v1/connections/app/nope/mail/authorize',
      '/rest/v1/connections/app/billing/planned/authorize',
      '/rest/v1/connections/app/billing/mail/authorize',
    ]) {
      expect((await request(path, { headers })).status).toBe(404);
    }

    const posted = await request('/rest/v1/connections/app/shared/planned', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'x' }),
    });

    expect(posted.status).toBe(404);
  });
});
