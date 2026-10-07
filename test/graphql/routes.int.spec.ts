import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPHQL_PLAYGROUND_GET, GRAPHQL_POST, REST_OPTIONS } from '@frogbotai/next/routes';
import { formatNames } from 'payload';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHAT_ASSETS_SLUG } from '../../packages/frogbot/src/chat/collections/assets.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import config from './config.js';
import type { Chat, User as UserDoc } from './frogbot-types.js';
import {
  allowedOrigin,
  chatsSlug,
  disallowedOrigin,
  postsSlug,
  requestContextSlug,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const password = 'frogbot-graphql-password';
const graphQLURL = 'http://localhost/api/graphql';

const graphQLPost = GRAPHQL_POST(config);
const graphQLPlayground = GRAPHQL_PLAYGROUND_GET(config);
const restOptions = REST_OPTIONS(config);

type GraphQLBody<TData = Record<string, unknown>> = {
  data?: TData | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
};

type User = { id: UserDoc['id']; token: string };

async function query<TData = Record<string, unknown>>(
  source: string,
  { origin, token }: { origin?: string; token?: string } = {},
) {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (origin) headers.set('origin', origin);

  if (token) headers.set('authorization', `JWT ${token}`);

  const response = await graphQLPost(
    new Request(graphQLURL, { method: 'POST', headers, body: JSON.stringify({ query: source }) }),
  );

  return { response, body: (await response.json()) as GraphQLBody<TData> };
}

function corsHeaders(response: Response) {
  return Object.fromEntries(
    [...response.headers.entries()].filter(([name]) => name.startsWith('access-control-allow-')),
  );
}

describe('GraphQL routes', () => {
  let booted: BootedFrogBot;
  let userA: User;
  let userB: User;
  let chatA: Chat['id'];
  let chatB: Chat['id'];

  async function createUser(email: string): Promise<User> {
    const { id } = await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password },
      overrideAccess: true,
    });

    const response = await booted.restClient.post<{ token: string }>(`/api/${usersSlug}/login`, {
      email,
      password,
    });

    return { id, token: response.body.token };
  }

  async function createChat(user: User) {
    const chat = await booted.frogbot.create({
      collection: chatsSlug,
      data: { title: `chat for ${user.id}`, user: user.id },
      overrideAccess: true,
    });

    return chat.id;
  }

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'graphql-routes');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    userA = await createUser('a@graphql.test');
    userB = await createUser('b@graphql.test');
    chatA = await createChat(userA);
    chatB = await createChat(userB);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();

    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('POST /api/graphql returns the same chats as REST for the signed-in user', async () => {
    const rest = await booted.restClient.get<{ docs: { id: number | string }[] }>(
      `/api/${chatsSlug}`,
      { headers: { authorization: `JWT ${userA.token}` } },
    );

    const { response, body } = await query<{ Chats: { docs: { id: number | string }[] } }>(
      '{ Chats { docs { id } } }',
      { token: userA.token },
    );

    const graphQLIDs = body.data!.Chats.docs.map(({ id }) => String(id));

    expect(rest.status).toBe(200);
    expect(response.status).toBe(200);
    expect(graphQLIDs).toEqual(rest.body.docs.map(({ id }) => String(id)));
    expect(graphQLIDs).toEqual([String(chatA)]);
    expect(graphQLIDs).not.toContain(String(chatB));
  });

  it('POST /api/graphql denies an anonymous chats query as REST does', async () => {
    const rest = await booted.restClient.get(`/api/${chatsSlug}`);

    const { body } = await query('{ Chats { docs { id } } }');

    expect(rest.status).toBe(403);
    expect(body.data?.Chats ?? null).toBeNull();
    expect(body.errors?.[0]?.extensions?.statusCode).toBe(403);
  });

  it("POST /api/graphql hides another user's chat when queried by ID", async () => {
    const rest = await booted.restClient.get(`/api/${chatsSlug}/${chatA}`, {
      headers: { authorization: `JWT ${userB.token}` },
    });

    const { body } = await query(`{ Chat(id: ${JSON.stringify(chatA)}) { id } }`, {
      token: userB.token,
    });

    expect(rest.status).toBe(404);
    expect(body.data?.Chat ?? null).toBeNull();
    expect(body.errors?.[0]?.extensions?.statusCode).toBe(rest.status);
  });

  it.each([
    ['anonymous', undefined],
    ['another user', 'userB'],
  ] as const)(
    'POST /api/graphql denies %s updates to an owned chat as REST does',
    async (_, actor) => {
      const token = actor === 'userB' ? userB.token : undefined;
      const headers = token ? { authorization: `JWT ${token}` } : undefined;
      const rest = await booted.restClient.patch(
        `/api/${chatsSlug}/${chatA}`,
        { title: 'unauthorized REST update' },
        { headers },
      );

      const { body } = await query(
        `mutation { updateChat(id: ${JSON.stringify(chatA)}, data: { title: "unauthorized GraphQL update" }) { id } }`,
        { token },
      );

      const chat = await booted.frogbot.findByID({
        collection: chatsSlug,
        id: chatA,
        overrideAccess: true,
      });

      expect(rest.status).toBe(403);
      expect(body.data?.updateChat ?? null).toBeNull();
      expect(body.errors?.[0]?.extensions?.statusCode).toBe(rest.status);
      expect(chat.title).toBe(`chat for ${userA.id}`);
    },
  );

  it.each([
    ['anonymous', undefined],
    ['another user', 'userB'],
  ] as const)(
    'POST /api/graphql denies %s deletes of an owned chat as REST does',
    async (_, actor) => {
      const token = actor === 'userB' ? userB.token : undefined;
      const headers = token ? { authorization: `JWT ${token}` } : undefined;
      const rest = await booted.restClient.delete(`/api/${chatsSlug}/${chatA}`, { headers });

      const { body } = await query(`mutation { deleteChat(id: ${JSON.stringify(chatA)}) { id } }`, {
        token,
      });

      const chat = await booted.frogbot.findByID({
        collection: chatsSlug,
        id: chatA,
        overrideAccess: true,
      });

      expect(rest.status).toBe(403);
      expect(body.data?.deleteChat ?? null).toBeNull();
      expect(body.errors?.[0]?.extensions?.statusCode).toBe(rest.status);
      expect(String(chat.id)).toBe(String(chatA));
    },
  );

  it('POST /api/graphql login returns a token that authenticates an owned-chat query', async () => {
    const login = await query<{ loginUser: { token: string; user: { id: number | string } } }>(
      `mutation { loginUser(email: "a@graphql.test", password: ${JSON.stringify(password)}) { token user { id } } }`,
    );

    expect(login.body.errors).toBeUndefined();
    expect(login.body.data!.loginUser.token).toEqual(expect.any(String));
    expect(String(login.body.data!.loginUser.user.id)).toBe(String(userA.id));

    const { body } = await query<{ Chats: { docs: { id: number | string }[] } }>(
      '{ Chats { docs { id } } }',
      { token: login.body.data!.loginUser.token },
    );

    expect(body.errors).toBeUndefined();
    expect(body.data!.Chats.docs.map(({ id }) => String(id))).toEqual([String(chatA)]);
  });

  it('POST /api/graphql rejects invalid login credentials without issuing a token', async () => {
    const { body } = await query<{ loginUser: { token?: string } | null }>(
      'mutation { loginUser(email: "a@graphql.test", password: "incorrect") { token } }',
    );

    expect(body.data?.loginUser ?? null).toBeNull();
    expect(body.errors?.[0]?.extensions?.statusCode).toBe(401);
  });

  it('POST /api/graphql denies an anonymous createChat mutation as REST does', async () => {
    const rest = await booted.restClient.post(`/api/${chatsSlug}`, { title: 'anonymous' });

    const { body } = await query('mutation { createChat(data: { title: "anonymous" }) { id } }');

    const { totalDocs } = await booted.frogbot.find({
      collection: chatsSlug,
      where: { title: { equals: 'anonymous' } },
      overrideAccess: true,
    });

    expect(rest.status).toBe(403);
    expect(body.errors?.[0]?.extensions?.statusCode).toBe(403);
    expect(totalDocs).toBe(0);
  });

  it('POST /api/graphql creates a post and reads it back', async () => {
    const created = await query<{ createPost: { id: number | string } }>(
      'mutation { createPost(data: { title: "Hello", body: "From GraphQL" }) { id } }',
      { token: userA.token },
    );

    const post = await booted.frogbot.findByID({
      collection: postsSlug,
      id: created.body.data!.createPost.id,
      overrideAccess: true,
    });

    expect(created.body.errors).toBeUndefined();
    expect(post).toMatchObject({ title: 'Hello', body: 'From GraphQL' });
  });

  it('POST /api/graphql runs access functions with req.frogbot attached', async () => {
    await booted.frogbot.create({
      collection: requestContextSlug,
      data: { label: 'visible' },
      overrideAccess: true,
    });

    const { body } = await query<{ RequestContexts: { docs: { label: string }[] } }>(
      '{ RequestContexts { docs { label } } }',
    );

    expect(body.errors).toBeUndefined();
    expect(body.data!.RequestContexts.docs).toEqual([{ label: 'visible' }]);
  });

  it('POST /api/graphql runs a custom query alongside search queries with req.frogbot', async () => {
    await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'Counted', body: 'Custom resolver' },
      overrideAccess: true,
    });

    const { body } = await query<{ postTotal: number }>('{ postTotal }');

    expect(body.errors).toBeUndefined();
    expect(body.data!.postTotal).toBe(1);
  });

  it('generated search resolvers keep working beside custom req.frogbot queries', async () => {
    await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'Orchard', body: 'Apples grow in the orchard' },
    });

    const { body } = await query<{
      postTotal: number;
      searchPosts: { hits: { doc: { title: string } }[] };
    }>('{ postTotal searchPosts(index: "content", text: "orchard") { hits { doc { title } } } }');

    expect(body.errors).toBeUndefined();
    expect(body.data?.postTotal).toBe(1);
    expect(body.data?.searchPosts.hits.map(({ doc }) => doc.title)).toEqual(['Orchard']);
  });

  it('POST /api/graphql runs aliased search queries that match Local API search', async () => {
    for (const title of [
      'Orchard apple trees',
      'Apple orchard harvest',
      'Pear orchard',
      'Apple pie',
    ]) {
      await booted.frogbot.create({ collection: postsSlug, data: { title }, overrideAccess: true });
    }

    const { body } = await query<
      Record<'orchard' | 'apple', { hits: { doc: { id: number | string }; score: number }[] }>
    >(`{
      orchard: searchPosts(index: "content", text: "orchard", limit: 2) { hits { doc { id } score } }
      apple: searchPosts(index: "content", text: "apple", limit: 3) { hits { doc { id } score } }
    }`);

    const local = async (text: string, limit: number) => {
      const { hits } = await booted.frogbot.search({
        collection: postsSlug,
        index: 'content',
        query: { text },
        limit,
        req: await booted.frogbot.createRequest(),
      });

      return hits.map(({ doc, score }) => ({ doc: { id: doc.id }, score }));
    };

    expect(body.errors).toBeUndefined();
    expect(body.data!.orchard.hits).toHaveLength(2);
    expect(body.data!.apple.hits).toHaveLength(3);
    expect(body.data).toEqual({
      orchard: { hits: await local('orchard', 2) },
      apple: { hits: await local('apple', 3) },
    });
  });

  it('POST /api/graphql rejects queries for hidden internal collections', async () => {
    const chatAssets = formatNames(CHAT_ASSETS_SLUG).plural;
    const { body } = await query(
      `{ ${chatAssets} { docs { id } } PayloadPreferences { totalDocs } }`,
      {
        token: userA.token,
      },
    );

    const messages = body.errors?.map(({ message }) => message) ?? [];

    expect(body.data ?? null).toBeNull();
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`Cannot query field "${chatAssets}"`),
        expect.stringContaining('Cannot query field "PayloadPreferences"'),
      ]),
    );
  });

  it('OPTIONS /api/graphql returns the same CORS headers as REST for an allowed origin', async () => {
    const request = (url: string) =>
      new Request(url, {
        method: 'OPTIONS',
        headers: { origin: allowedOrigin, 'access-control-request-method': 'POST' },
      });

    const graphQL = await restOptions(request(graphQLURL), {
      params: Promise.resolve({ slug: ['graphql'] }),
    });
    const rest = await restOptions(request(`http://localhost/api/${usersSlug}`), {
      params: Promise.resolve({ slug: [usersSlug] }),
    });

    expect(corsHeaders(graphQL)['access-control-allow-origin']).toBe(allowedOrigin);
    expect(corsHeaders(graphQL)).toEqual(corsHeaders(rest));
  });

  it('OPTIONS /api/graphql returns no allow-origin header for a disallowed origin', async () => {
    const response = await restOptions(
      new Request(graphQLURL, {
        method: 'OPTIONS',
        headers: { origin: disallowedOrigin, 'access-control-request-method': 'POST' },
      }),
      { params: Promise.resolve({ slug: ['graphql'] }) },
    );

    expect(corsHeaders(response)).not.toHaveProperty('access-control-allow-origin');
  });

  it('POST /api/graphql returns the allow-origin header for an allowed origin', async () => {
    const { response } = await query('{ Users { totalDocs } }', { origin: allowedOrigin });

    expect(response.headers.get('access-control-allow-origin')).toBe(allowedOrigin);
  });

  it('POST /api/graphql returns no allow-origin header for a disallowed origin', async () => {
    const { response } = await query('{ Users { totalDocs } }', { origin: disallowedOrigin });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('GET /api/graphql-playground serves the playground in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const response = await graphQLPlayground(
      new Request('http://localhost/api/graphql-playground'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html');
    expect(await response.text()).toContain('/api/graphql');
  });

  it('GET /api/graphql-playground returns 404 in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await graphQLPlayground(
      new Request('http://localhost/api/graphql-playground'),
    );

    expect(response.status).toBe(404);
  });

  it('POST /api/graphql rejects introspection in production and still answers queries', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const introspection = await query('{ __schema { types { name } } }');
    const users = await query<{ Users: { totalDocs: number } }>('{ Users { totalDocs } }', {
      token: userA.token,
    });

    expect(introspection.body.data ?? null).toBeNull();
    expect(introspection.body.errors?.[0]?.message).toMatch(/introspection/i);
    expect(users.body.data!.Users.totalDocs).toBe(2);
  });
});
