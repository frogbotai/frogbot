import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPHQL_POST } from '@frogbotai/next/routes';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { chatsSlug, usersSlug } from '../shared.js';
import config, { notesSlug, seenFrogBot } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const password = 'frogbot-graphql-password';
const graphQLPost = GRAPHQL_POST(config);

type GraphQLBody<TData> = {
  data?: TData | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
};

async function query<TData>(source: string, token?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (token) headers.set('authorization', `JWT ${token}`);

  const response = await graphQLPost(
    new Request('http://localhost/api/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: source }),
    }),
  );

  return (await response.json()) as GraphQLBody<TData>;
}

describe('custom GraphQL resolvers', () => {
  let booted: BootedFrogBot;
  let token: string;

  async function createUser(email: string) {
    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password },
      overrideAccess: true,
    });

    const login = await booted.restClient.post<{ token: string }>(`/api/${usersSlug}/login`, {
      email,
      password,
    });

    return { id: user.id, token: login.body.token };
  }

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'graphql-custom-resolvers');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    const owner = await createUser('owner@graphql.test');
    const other = await createUser('other@graphql.test');

    token = owner.token;

    await booted.frogbot.create({
      collection: chatsSlug,
      data: { title: 'Owner chat', user: owner.id },
      overrideAccess: true,
    });
    await booted.frogbot.create({
      collection: chatsSlug,
      data: { title: 'Other chat', user: other.id },
      overrideAccess: true,
    });

    seenFrogBot.endpoint = undefined;
    seenFrogBot.resolver = undefined;
  });

  afterEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it("a custom query reads through req.frogbot with the caller's access", async () => {
    const body = await query<{ myChatTitles: string[] }>('{ myChatTitles }', token);

    expect(body.errors).toBeUndefined();
    expect(body.data!.myChatTitles).toEqual(['Owner chat']);
  });

  it('a custom query without a user gets access-denied results from req.frogbot', async () => {
    const body = await query<{ myChatTitles: string[] | null }>('{ myChatTitles }');

    expect(body.data?.myChatTitles ?? null).toBeNull();
    expect(body.errors?.[0]?.extensions?.statusCode).toBe(403);
  });

  it('a custom mutation writes through req.frogbot and the document reads back', async () => {
    const body = await query<{ addNote: string }>(
      'mutation { addNote(title: "From GraphQL") }',
      token,
    );

    const note = await booted.frogbot.findByID({
      collection: notesSlug,
      id: body.data!.addNote,
      overrideAccess: true,
    });

    expect(body.errors).toBeUndefined();
    expect(note).toMatchObject({ title: 'From GraphQL' });
  });

  it('a custom mutation without a user is denied by collection access', async () => {
    const body = await query<{ addNote: string | null }>(
      'mutation { addNote(title: "Anonymous") }',
    );

    const { totalDocs } = await booted.frogbot.count({
      collection: notesSlug,
      overrideAccess: true,
    });

    expect(body.errors?.[0]?.extensions?.statusCode).toBe(403);
    expect(totalDocs).toBe(0);
  });

  it('a custom resolver receives the same req.frogbot as an endpoint', async () => {
    const endpoint = await booted.restClient.get('/api/frogbot-identity');

    await query('{ myChatTitles }');

    expect(endpoint.status).toBe(200);
    expect(seenFrogBot.resolver).toBeDefined();
    expect(seenFrogBot.resolver).toBe(seenFrogBot.endpoint);
  });

  it('nested custom fields inherit req.frogbot and enforce the signed-in caller access', async () => {
    const body = await query<{
      nestedContext: { label: string; sameInstance: boolean; chatTitles: string[] };
    }>('{ nestedContext { label sameInstance chatTitles } }', token);

    expect(body.errors).toBeUndefined();
    expect(body.data?.nestedContext).toEqual({
      label: 'Default field resolver',
      sameInstance: true,
      chatTitles: ['Owner chat'],
    });
  });

  it('a custom root field without resolve retains GraphQL default resolution', async () => {
    const body = await query<{ defaultQuery: null }>('{ defaultQuery }');

    expect(body.errors).toBeUndefined();
    expect(body.data).toEqual({ defaultQuery: null });
  });

  it('nested custom fields inherit req.frogbot for anonymous requests', async () => {
    const body = await query<{
      nestedContext: { sameInstance: boolean; chatTitles: string[] | null };
    }>('{ nestedContext { sameInstance chatTitles } }');

    expect(body.data?.nestedContext).toEqual({ sameInstance: true, chatTitles: null });
    expect(body.errors?.[0]?.extensions?.statusCode).toBe(403);
  });

  it('a synchronous custom resolver error surfaces as a GraphQL error', async () => {
    const body = await query<{ resolverFailure: null }>('{ resolverFailure }');

    expect(body.data?.resolverFailure).toBeNull();
    expect(body.errors).toEqual([
      expect.objectContaining({
        message: 'Something went wrong.',
        path: ['resolverFailure'],
        extensions: expect.objectContaining({ statusCode: 500 }),
      }),
    ]);
    expect(seenFrogBot.resolver).toBe(booted.frogbot);
  });

  it('a rejected custom mutation surfaces as a GraphQL error', async () => {
    const body = await query<{ mutationFailure: null }>('mutation { mutationFailure }', token);

    expect(body.data?.mutationFailure).toBeNull();
    expect(body.errors).toEqual([
      expect.objectContaining({
        message: 'Something went wrong.',
        path: ['mutationFailure'],
        extensions: expect.objectContaining({ statusCode: 500 }),
      }),
    ]);
    expect(seenFrogBot.resolver).toBe(booted.frogbot);
  });

  it('the documented RecentUsers resolver returns a paginated Local API result', async () => {
    const body = await query<{ RecentUsers: { totalDocs: number; docs: { email: string }[] } }>(
      '{ RecentUsers { totalDocs docs { email } } }',
    );

    expect(body.errors).toBeUndefined();
    expect(body.data?.RecentUsers.totalDocs).toBe(2);
    expect(body.data?.RecentUsers.docs.map(({ email }) => email).sort()).toEqual([
      'other@graphql.test',
      'owner@graphql.test',
    ]);
  });
});
