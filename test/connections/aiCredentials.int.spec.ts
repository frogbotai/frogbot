import type { FrogBotRequest } from 'frogbot';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AGENT_MODELS,
  AGENT_SLUG,
  bootLinked,
  keysFor,
  MODEL,
  modelCalls,
  modelListings,
  openai,
  RECONNECT_ERROR,
  resetOpenAI,
  stubOpenAI,
  textReply,
  toolReply,
} from './aiCredentials.js';

type Seen = { user: unknown; agent: unknown };

const seen: Seen[] = [];

describe(`AI calls on linked OpenAI accounts, with an app key [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let booted: Awaited<ReturnType<typeof bootLinked>>;
  let alice: FrogBotRequest;
  let bob: FrogBotRequest;

  beforeAll(async () => {
    stubOpenAI();

    booted = await bootLinked({
      ai: {
        providers: { openai: { apiKey: 'sk-app' } },
        hooks: {
          beforeUpstream: [
            ({ req, agent, messages }) => {
              if (JSON.stringify(messages).includes('look it up')) {
                seen.push({ user: req?.user?.email, agent: agent?.slug });
              }
            },
          ],
        },
      },
    });

    alice = await booted.member('alice@example.com');
    bob = await booted.member('bob@example.com');

    const linked = await booted.link(alice, { apiKey: 'sk-alice' });

    if (linked.status !== 200) throw new Error(`Linking failed with ${linked.status}.`);
  });

  afterAll(async () => {
    await booted?.frogbot.destroy();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    resetOpenAI();
    seen.length = 0;
  });

  it("sends each user's own key, or the app key, on sequential and concurrent turns", async () => {
    await booted.turn(alice, 'alice-first');
    await booted.turn(bob, 'bob-first');

    await Promise.all([
      booted.turn(alice, 'alice-second'),
      booted.turn(bob, 'bob-second'),
      booted.turn(alice, 'alice-third'),
      booted.turn(bob, 'bob-third'),
    ]);

    for (const marker of ['alice-first', 'alice-second', 'alice-third']) {
      expect(keysFor(marker)).toEqual(['Bearer sk-alice']);
    }

    for (const marker of ['bob-first', 'bob-second', 'bob-third']) {
      expect(keysFor(marker)).toEqual(['Bearer sk-app']);
    }
  });

  it('gives beforeUpstream hooks req and agent on every agent step', async () => {
    openai.replies.push(toolReply('lookup'), textReply('done'));

    await booted.turn(alice, 'look it up');

    expect(keysFor('look it up')).toEqual(['Bearer sk-alice', 'Bearer sk-alice']);
    expect(seen).toEqual([
      { user: 'alice@example.com', agent: AGENT_SLUG },
      { user: 'alice@example.com', agent: AGENT_SLUG },
    ]);
  });

  it('fails a revoked account with "Reconnect OpenAI" and sends nothing on the app key', async () => {
    const carol = await booted.member('carol@example.com');

    await booted.link(carol, { apiKey: 'sk-carol' });

    await booted.frogbot.update({
      collection: 'connections',
      where: { owner: { equals: carol.user!.id } },
      data: { status: 'revoked' },
      overrideAccess: true,
    });

    await expect(booted.turn(carol, 'carol-revoked')).rejects.toThrow(RECONNECT_ERROR);
    expect(modelCalls()).toEqual([]);
  });

  it('checks a pasted key once and stores no row when OpenAI rejects it', async () => {
    const erin = await booted.member('erin@example.com');
    const response = await booted.link(erin, { apiKey: 'sk-rejected' });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "OpenAI didn't accept this key." });
    expect(modelListings()).toHaveLength(1);

    const rows = await booted.frogbot.find({
      collection: 'connections',
      where: { owner: { equals: erin.user!.id } },
      overrideAccess: true,
    });

    expect(rows.docs).toEqual([]);
  });

  it('saves a restricted key that may not list models, and shows that user the full picker', async () => {
    const hana = await booted.member('hana@example.com');
    const response = await booted.link(hana, { apiKey: 'sk-restricted' });

    expect(response.status).toBe(200);
    await expect(booted.picker(hana)).resolves.toMatchObject({
      models: [...AGENT_MODELS],
      defaultModel: MODEL,
    });

    await booted.turn(hana, 'restricted-turn');

    expect(keysFor('restricted-turn')).toEqual(['Bearer sk-restricted']);
  });

  it("narrows a linked user's picker to their key's catalog models, cached until relink", async () => {
    const frank = await booted.member('frank@example.com');

    expect((await booted.link(frank, { apiKey: 'sk-frank' })).status).toBe(200);

    const listed = { models: [MODEL, 'openai/gpt-4o'], defaultModel: MODEL };

    await expect(booted.picker(frank)).resolves.toMatchObject(listed);
    await expect(booted.picker(frank)).resolves.toMatchObject(listed);
    expect(modelListings()).toHaveLength(1);

    openai.models = ['gpt-4.1'];

    expect((await booted.link(frank, { apiKey: 'sk-frank-2' })).status).toBe(200);
    await expect(booted.picker(frank)).resolves.toMatchObject({
      models: ['openai/gpt-4.1'],
      defaultModel: 'openai/gpt-4.1',
    });
    expect(modelListings().map(({ authorization }) => authorization)).toEqual([
      'Bearer sk-frank',
      'Bearer sk-frank-2',
    ]);
  });

  it('shows the full list to a user without a linked account, or when listing fails', async () => {
    const full = { models: [...AGENT_MODELS], defaultModel: MODEL };

    await expect(booted.picker(bob)).resolves.toMatchObject(full);

    const gina = await booted.member('gina@example.com');

    await (
      await booted.frogbot.connections.store
    ).upsert({
      owner: { id: gina.user!.id, collection: 'members' },
      piece: 'openai',
      method: 'secret',
      credential: { apiKey: 'sk-gina' },
    });

    openai.modelsDown = true;

    await expect(booted.picker(gina)).resolves.toMatchObject(full);
    expect(modelListings().map(({ authorization }) => authorization)).toEqual(['Bearer sk-gina']);
  });
});
