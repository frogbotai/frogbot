import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrogBotRequest } from '../../packages/frogbot/src/types/request.js';
import {
  AGENT_SLUG,
  bootLinked,
  keysFor,
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
    expect(openai.requests).toEqual([]);
  });
});
