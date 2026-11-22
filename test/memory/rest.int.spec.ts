import type { FrogBotInstance } from 'frogbot';
import { databaseMemory } from 'frogbot/memory';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createFrogBotSDK, FrogBotSDKError } from '../../packages/sdk/src/index.js';
import { createMemoryHarness } from './runtime.js';
import { usersSlug } from './shared.js';

const origin = 'http://frogbot.test';

describe('memory REST and SDK', () => {
  const harness = createMemoryHarness({
    memory: () =>
      databaseMemory({
        maxPerScope: 3,
        access: { read: ({ req }) => String(req.user?.email).startsWith('staff') },
      }),
  });

  let frogbot: FrogBotInstance;
  let ann: Record<string, string>;
  let ben: Record<string, string>;
  let staff: Record<string, string>;

  async function signIn(email: string): Promise<Record<string, string>> {
    await harness.createUser(email);

    const response = await frogbot.handleRequest(
      new Request(`${origin}/api/${usersSlug}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'frogbot-test-password' }),
      }),
    );

    const { token } = (await response.json()) as { token: string };

    return { authorization: `JWT ${token}` };
  }

  async function send(
    method: string,
    path: string,
    { body, headers = {} }: { body?: unknown; headers?: Record<string, string> } = {},
  ) {
    const response = await frogbot.handleRequest(
      new Request(`${origin}/api/frogbot/memory${path}`, {
        method,
        headers: {
          ...headers,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined
          ? {}
          : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      }),
    );

    return { status: response.status, body: (await response.json()) as Record<string, any> };
  }

  function sdkAs(headers: Record<string, string>) {
    return createFrogBotSDK({
      baseURL: `${origin}/api`,
      headers,
      fetch: (input, init) => frogbot.handleRequest(new Request(input, init)),
    });
  }

  beforeAll(async () => {
    frogbot = await harness.boot();
    ann = await signIn('ann@example.com');
    ben = await signIn('ben@example.com');
    staff = await signIn('staff@example.com');
  });

  afterAll(() => harness.close());

  beforeEach(async () => {
    for (const headers of [ann, ben]) await send('DELETE', '?scope=me', { headers });

    await frogbot.memory.forget({ scope: 'team' });
  });

  it('saves, gets, updates, searches, lists and forgets the signed-in person’s memories', async () => {
    const saved = await send('POST', '', {
      headers: ann,
      body: { scope: 'me', key: 'drink', text: 'Ann drinks green tea' },
    });

    expect(saved).toMatchObject({
      status: 200,
      body: { key: 'drink', scope: 'me', pinned: false },
    });

    const id = saved.body.id as string;

    expect((await send('GET', `/${id}?scope=me`, { headers: ann })).body.text).toBe(
      'Ann drinks green tea',
    );

    const updated = await send('PATCH', `/${id}`, {
      headers: ann,
      body: { scope: 'me', pinned: true, key: null },
    });

    expect(updated.body).toMatchObject({ id, pinned: true, text: 'Ann drinks green tea' });
    expect(updated.body.key).toBeUndefined();

    const hits = await send('GET', '/search?scope=me&query=tea&limit=5', { headers: ann });

    expect(hits.body).toEqual([
      expect.objectContaining({ memory: expect.objectContaining({ id }) }),
    ]);

    const pinned = await send('GET', '?scope=me&pinned=true&limit=10&page=1', { headers: ann });

    expect(pinned.body).toEqual({ docs: [expect.objectContaining({ id })], hasNextPage: false });
    expect(await send('DELETE', `/${id}?scope=me`, { headers: ann })).toEqual({
      status: 200,
      body: { deleted: 1 },
    });
    expect((await send('GET', '?scope=me', { headers: ann })).body.docs).toEqual([]);
  });

  it('keeps one person’s me memories from another', async () => {
    const { body } = await send('POST', '', {
      headers: ann,
      body: { scope: 'me', text: 'Ann’s secret' },
    });

    expect((await send('GET', '?scope=me', { headers: ben })).body.docs).toEqual([]);
    expect((await send('GET', `/${body.id}?scope=me`, { headers: ben })).status).toBe(404);
    expect((await send('DELETE', `/${body.id}?scope=me`, { headers: ben })).status).toBe(404);

    expect(
      (await send('PATCH', `/${body.id}`, { headers: ben, body: { scope: 'me', text: 'Changed' } }))
        .status,
    ).toBe(404);
    expect((await send('DELETE', '?scope=me', { headers: ben })).body).toEqual({ deleted: 0 });
    expect((await send('GET', `/${body.id}?scope=me`, { headers: ann })).body.text).toBe(
      'Ann’s secret',
    );
  });

  it.each(['abc', '99999999999999999999999', '2147483648'])(
    'answers 404 for the malformed or out-of-range id %s',
    async (id) => {
      expect((await send('GET', `/${id}?scope=me`, { headers: ann })).status).toBe(404);
      expect((await send('DELETE', `/${id}?scope=me`, { headers: ann })).status).toBe(404);

      expect(
        (await send('PATCH', `/${id}`, { headers: ann, body: { scope: 'me', pinned: true } }))
          .status,
      ).toBe(404);
    },
  );

  it('refuses me with 403 when nobody is signed in', async () => {
    expect((await send('GET', '?scope=me')).status).toBe(403);
    expect((await send('POST', '', { body: { scope: 'me', text: 'Anonymous' } })).status).toBe(403);
  });

  it('follows the app’s access functions for shared scopes', async () => {
    await frogbot.memory.save({ scope: 'team', text: 'Office closes at six' });

    const asStaff = await send('GET', '?scope=team', { headers: staff });

    expect(asStaff.body.docs.map(({ text }: { text: string }) => text)).toEqual([
      'Office closes at six',
    ]);
    expect((await send('GET', '?scope=team', { headers: ann })).status).toBe(403);

    expect(
      (await send('POST', '', { headers: staff, body: { scope: 'team', text: 'No write' } }))
        .status,
    ).toBe(403);
    expect((await send('DELETE', '?scope=team', { headers: staff })).status).toBe(403);
    expect((await frogbot.memory.list({ scope: 'team' })).docs).toHaveLength(1);
  });

  it.each([
    { name: 'text over 4,000 characters', body: { scope: 'me', text: 'a'.repeat(4_001) } },
    { name: 'an unknown option', body: { scope: 'me', text: 'Hi', user: { id: 1 } } },
    { name: 'overrideAccess in the body', body: { scope: 'me', text: 'Hi', overrideAccess: true } },
    { name: 'an undeclared scope word', body: { scope: 'client', text: 'Hi' } },
    { name: 'an unknown agent', body: { scope: 'agent', agent: 'nobody', text: 'Hi' } },
    { name: 'malformed JSON', body: '{"scope":' },
    { name: 'an array body', body: '[]' },
  ])('rejects $name with 400', async ({ body }) => {
    const response = await send('POST', '', { headers: ann, body });

    expect(response.status).toBe(400);
    expect(response.body.errors[0].message).toEqual(expect.any(String));
  });

  it('rejects unknown query parameters and bad limits with 400', async () => {
    expect((await send('GET', '?scope=me&where=x', { headers: ann })).status).toBe(400);
    expect((await send('GET', '?scope=me&limit=abc', { headers: ann })).status).toBe(400);
    expect((await send('GET', '?scope=me&pinned=yes', { headers: ann })).status).toBe(400);
  });

  it('answers 409 at the per-scope cap', async () => {
    for (const text of ['One fact', 'Second note', 'Third thing']) {
      expect((await send('POST', '', { headers: ann, body: { scope: 'me', text } })).status).toBe(
        200,
      );
    }

    const full = await send('POST', '', { headers: ann, body: { scope: 'me', text: 'Fourth' } });

    expect(full.status).toBe(409);
    expect(full.body.errors[0].message).toContain('already holds 3');
  });

  it('sdk.memory returns what the Local API returns for the same person', async () => {
    const sdk = sdkAs(ann);
    const { docs } = await frogbot.find({
      collection: usersSlug,
      where: { email: { equals: 'ann@example.com' } },
      overrideAccess: true,
    });

    const user = docs[0];

    const local = { scope: 'me', user: { ...user, collection: usersSlug } };
    const saved = await sdk.memory.save({ scope: 'me', text: 'Ann likes trains', pinned: true });

    expect(await sdk.memory.get({ scope: 'me', id: saved.id })).toEqual(
      await frogbot.memory.get({ ...local, id: saved.id }),
    );
    expect(await sdk.memory.list({ scope: 'me' })).toEqual(await frogbot.memory.list(local));
    expect(await sdk.memory.search({ scope: 'me', query: 'trains' })).toEqual(
      await frogbot.memory.search({ ...local, query: 'trains' }),
    );
    expect(await sdk.memory.update({ scope: 'me', id: saved.id, pinned: false })).toMatchObject({
      pinned: false,
    });
    expect(await sdk.memory.forget({ scope: 'me', id: saved.id })).toEqual({ deleted: 1 });

    const missing = await sdk.memory.get({ scope: 'me', id: saved.id }).catch((error) => error);

    expect(missing).toBeInstanceOf(FrogBotSDKError);
    expect(missing.status).toBe(404);
  });
});
