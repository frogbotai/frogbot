import { createGatewayHandler, type FrogBotRequest } from 'frogbot';
import { getFrogBotPayload } from 'frogbot/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bootLinked,
  keysFor,
  MODEL,
  modelCalls,
  modelListings,
  openai,
  RECONNECT_ERROR,
  resetOpenAI,
  stubOpenAI,
} from './aiCredentials.js';

describe(`Linked OpenAI keys stay with their user [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let booted: Awaited<ReturnType<typeof bootLinked>>;
  let alice: FrogBotRequest;
  let bob: FrogBotRequest;
  let carol: FrogBotRequest;

  const token = async (email: string) => {
    const { token } = await booted.frogbot.login({
      collection: 'members',
      data: { email, password: 'password' },
      overrideAccess: true,
    });

    return token!;
  };

  const http = (jwt: string, marker: string) =>
    createGatewayHandler(booted.frogbot)(
      new Request('http://localhost/api/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `JWT ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: marker }] }),
      }),
    );

  beforeAll(async () => {
    stubOpenAI();

    booted = await bootLinked({ ai: { providers: { openai: { apiKey: 'sk-app' } } } });

    alice = await booted.member('alice@example.com');
    bob = await booted.member('bob@example.com');
    carol = await booted.member('carol@example.com');

    for (const [req, apiKey] of [
      [alice, 'sk-alice'],
      [bob, 'sk-bob'],
    ] as const) {
      const linked = await booted.link(req, { apiKey });

      if (linked.status !== 200) throw new Error(`Linking failed with ${linked.status}.`);
    }
  });

  afterAll(async () => {
    await booted?.frogbot.destroy();
    vi.unstubAllGlobals();
  });

  beforeEach(() => resetOpenAI());

  it('keeps two linked keys apart across concurrent streams, turns, generateText and embed', async () => {
    const stream = async (req: FrogBotRequest, marker: string) => {
      const result = await booted.frogbot.agents.support.aiAgent.stream({
        prompt: marker,
        options: { req, overrideAccess: true },
      });

      await result.consumeStream();
    };

    const work: PromiseLike<unknown>[] = [];

    for (let i = 0; i < 8; i++) {
      for (const [name, req] of [
        ['alice', alice],
        ['bob', bob],
        ['carol', carol],
      ] as const) {
        work.push(
          stream(req, `${name}-stream-${i}`),
          booted.turn(req, `${name}-turn-${i}`),
          booted.frogbot.generateText({ model: MODEL, req, prompt: `${name}-text-${i}` }),
          booted.frogbot.embed({
            model: 'openai/text-embedding-3-small',
            req,
            value: `${name}-embed-${i}`,
          }),
        );
      }
    }

    await Promise.allSettled(work);

    const expected = { alice: 'Bearer sk-alice', bob: 'Bearer sk-bob', carol: 'Bearer sk-app' };

    for (const [name, key] of Object.entries(expected)) {
      for (let i = 0; i < 8; i++) {
        for (const kind of ['stream', 'turn', 'text', 'embed']) {
          expect(keysFor(`${name}-${kind}-${i}`), `${name}-${kind}-${i}`).toEqual([key]);
        }
      }
    }
  });

  it('sends each user their own key on concurrent /api/v1 chat completions', async () => {
    const [aliceJWT, bobJWT, carolJWT] = await Promise.all([
      token('alice@example.com'),
      token('bob@example.com'),
      token('carol@example.com'),
    ]);

    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) => [
        http(aliceJWT, `alice-http-${i}`),
        http(bobJWT, `bob-http-${i}`),
        http(carolJWT, `carol-http-${i}`),
      ]).flat(),
    );

    expect(responses.map(({ status }) => status)).toEqual(responses.map(() => 200));

    for (let i = 0; i < 6; i++) {
      expect(keysFor(`alice-http-${i}`)).toEqual(['Bearer sk-alice']);
      expect(keysFor(`bob-http-${i}`)).toEqual(['Bearer sk-bob']);
      expect(keysFor(`carol-http-${i}`)).toEqual(['Bearer sk-app']);
    }
  });

  it('never falls back to the app key for a broken account, on any path', async () => {
    const dana = await booted.member('dana@example.com');

    await booted.link(dana, { apiKey: 'sk-dana' });

    await booted.frogbot.update({
      collection: 'connections',
      where: { owner: { equals: dana.user!.id } },
      data: { status: 'error' },
      overrideAccess: true,
    });

    await expect(booted.turn(dana, 'dana-turn')).rejects.toThrow(RECONNECT_ERROR);
    await expect(
      booted.frogbot.generateText({ model: MODEL, req: dana, prompt: 'dana-text' }),
    ).rejects.toThrow(RECONNECT_ERROR);

    const response = await http(await token('dana@example.com'), 'dana-http');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { message: RECONNECT_ERROR } });
    expect(modelCalls()).toEqual([]);
  });

  it('runs work without a request on the app key', async () => {
    await booted.frogbot.generateText({ model: MODEL, prompt: 'job-text' });

    expect(keysFor('job-text')).toEqual(['Bearer sk-app']);
  });

  it("keeps each user's model list separate, and relinking clears only that user's", async () => {
    const erin = await booted.member('erin@example.com');
    const frank = await booted.member('frank@example.com');

    openai.models = ['gpt-4o'];
    await booted.link(erin, { apiKey: 'sk-erin' });
    openai.models = ['gpt-4.1'];
    await booted.link(frank, { apiKey: 'sk-frank' });

    const [erinList, frankList] = await Promise.all([booted.picker(erin), booted.picker(frank)]);

    expect(erinList?.models).toEqual(['openai/gpt-4o']);
    expect(frankList?.models).toEqual(['openai/gpt-4.1']);

    openai.models = ['gpt-4o-mini'];
    await booted.link(erin, { apiKey: 'sk-erin-2' });

    expect((await booted.picker(erin))?.models).toEqual([MODEL]);
    expect((await booted.picker(frank))?.models).toEqual(['openai/gpt-4.1']);
    expect(modelListings().map(({ authorization }) => authorization)).toEqual([
      'Bearer sk-erin',
      'Bearer sk-frank',
      'Bearer sk-erin-2',
    ]);
  });

  it('saves nothing when OpenAI is unreachable during the key check', async () => {
    const gina = await booted.member('gina@example.com');

    openai.modelsDown = true;

    const response = await booted.link(gina, { apiKey: 'sk-gina' });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Couldn't reach OpenAI to check this key. Try again.",
    });

    const rows = await booted.frogbot.find({
      collection: 'connections',
      where: { owner: { equals: gina.user!.id } },
      overrideAccess: true,
    });

    expect(rows.docs).toEqual([]);
  });

  it("tells a non-streamed agent request that OpenAI rejected the user's own key", async () => {
    const payload = getFrogBotPayload(booted.frogbot);
    const endpoint = (payload.config.endpoints || []).find(
      ({ method, path }) => method === 'post' && path === '/agents/:slug',
    )!;

    openai.replies.push(
      Response.json({ error: { message: 'Incorrect API key.' } }, { status: 401 }),
    );

    const response = await endpoint.handler({
      ...alice,
      payload,
      routeParams: { slug: 'support' },
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ prompt: 'alice-rejected' }),
    } as unknown as Parameters<typeof endpoint.handler>[0]);

    expect(keysFor('alice-rejected')).toEqual(['Bearer sk-alice']);
    expect(await response.json()).toEqual({
      error: 'OpenAI rejected your API key. Update it in Settings → Linked accounts.',
    });
  });

  it('keeps a stored key when a relink is rejected', async () => {
    const hank = await booted.member('hank@example.com');

    await booted.link(hank, { apiKey: 'sk-hank' });

    expect((await booted.link(hank, { apiKey: 'sk-rejected' })).status).toBe(422);

    await booted.turn(hank, 'hank-turn');

    expect(keysFor('hank-turn')).toEqual(['Bearer sk-hank']);
  });
});
