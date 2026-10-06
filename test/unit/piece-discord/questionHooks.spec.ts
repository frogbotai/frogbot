import type {
  ChannelQuestionCall,
  QuestionHookArgs,
  QuestionInteraction,
  QuestionRecord,
} from 'frogbot/pieces';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createDiscordClient,
  type DiscordClient,
  type DiscordRequest,
} from '../../../packages/pieces/piece-discord/src/client.js';
import { createDiscord } from '../../../packages/pieces/piece-discord/src/index.js';
import {
  callKey,
  encodeQuestionId,
} from '../../../packages/pieces/piece-discord/src/questions/ids.js';
import { discordQuestions } from '../../../packages/pieces/piece-discord/src/questions/index.js';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

const key = callKey('call-1');

const input: ChannelQuestionCall = {
  toolCallId: 'call-1',
  toolName: 'question',
  messageId: 'message-1',
  chatId: 'chat-1',
  agentSlug: 'support',
  createdAt: '2026-09-25T00:00:00.000Z',
  input: {
    questions: [
      {
        header: 'Colors',
        question: 'Pick colors',
        options: [{ label: 'Red' }, { label: 'Blue' }],
        multiple: true,
        custom: true,
      },
      { header: 'Size', question: 'Pick a size', options: [{ label: 'S' }], custom: true },
    ],
  },
};

function fixture(body: unknown = { id: '900' }) {
  const requests: DiscordRequest[] = [];
  const client = {
    request: vi.fn((request: DiscordRequest) => {
      requests.push(request);

      return Promise.resolve({ status: 200, headers: {}, body });
    }),
  } as unknown as DiscordClient;

  return { client, requests };
}

function thread(id: string) {
  return { id } as QuestionHookArgs<DiscordClient>['thread'];
}

function click(verb: 'select' | 'custom' | 'dismiss', n?: number): QuestionInteraction {
  return {
    type: 'action',
    event: {
      actionId: encodeQuestionId({ key, q: 0, verb, n }),
      user: { userId: 'U7', userName: 'toad', fullName: 'Toad' },
      raw: {},
    },
  } as unknown as QuestionInteraction;
}

function question(state?: unknown, id = '900'): QuestionRecord {
  return { messages: [{ id, postedAt: '2026-09-26T12:00:00.000Z' }], revision: 1, state };
}

function hookArgs(client: DiscordClient, state?: unknown, threadId = 'discord:G1:C1:T1') {
  return {
    call: input,
    client,
    question: question(state),
    req: {} as QuestionHookArgs<DiscordClient>['req'],
    thread: thread(threadId),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Discord question hooks', () => {
  it.each([
    ['a guild thread', 'discord:G1:C1:T1', 'T1'],
    ['a forum post', 'discord:G1:F1:P1', 'P1'],
    ['a channel', 'discord:G1:C1', 'C1'],
    ['a DM', 'discord:@me:D1', 'D1'],
  ])('renders the first call as one components-v2 message in %s', async (_, threadId, channel) => {
    const { client, requests } = fixture();
    const second = { ...input, toolCallId: 'call-2' };

    const rendered = await discordQuestions.render({
      calls: [input, second],
      client,
      req: {} as never,
      thread: thread(threadId),
    });

    expect(rendered).toEqual([{ calls: ['call-1'], messages: [{ id: '900', postedAt: '' }] }]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      path: `/channels/${channel}/messages`,
      body: { flags: 32768, allowed_mentions: { parse: [] } },
    });
  });

  it('fails a render when Discord returns no message id', async () => {
    const { client } = fixture({});

    await expect(
      discordQuestions.render({
        calls: [input],
        client,
        req: {} as never,
        thread: thread('discord:G1:C1'),
      }),
    ).rejects.toThrow('Discord did not return the question message id.');
  });

  it('records the card with the send time Discord returns', async () => {
    const { client } = fixture({ id: '900', timestamp: '2026-09-26T12:00:00.123000+00:00' });

    const rendered = await discordQuestions.render({
      calls: [input],
      client,
      req: {} as never,
      thread: thread('discord:G1:C1:T1'),
    });

    expect(rendered[0].messages).toEqual([{ id: '900', postedAt: '2026-09-26T12:00:00.123Z' }]);
  });

  it('redraws the card in place after arming, and skips a multi-select pick', async () => {
    const { client, requests } = fixture();

    await discordQuestions.updated!({
      ...hookArgs(client, { armed: { U7: { at: 1, picks: [] } } }),
      interaction: click('custom'),
    });
    await discordQuestions.updated!({
      ...hookArgs(client, { picks: { U7: { 0: [1] } } }),
      interaction: click('select', 0),
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'PATCH', path: '/channels/T1/messages/900' });
    expect(JSON.stringify(requests[0].body)).toContain('<@U7>, reply in this thread');
  });

  it('redraws the next question of a set after a typed answer', async () => {
    const { client, requests } = fixture();

    await discordQuestions.updated!({
      ...hookArgs(client, { q: 1, answers: [{ header: 'Colors', selected: [], custom: 'Teal' }] }),
      interaction: { type: 'message', message: {} } as unknown as QuestionInteraction,
    });

    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests[0].body)).toContain('**Size** · 2 of 2');
  });

  it('redraws the current card from the saved record when the retry job runs', async () => {
    const { client, requests } = fixture();
    const state = { q: 1, answers: [{ header: 'Colors', selected: ['Red'] }] };

    await discordQuestions.updated!({ ...hookArgs(client), question: question(state, '901') });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'PATCH', path: '/channels/T1/messages/901' });
    expect(JSON.stringify(requests[0].body)).toContain('**Size** · 2 of 2');
  });

  it('forgets the picks in the menus a redraw resets', async () => {
    const { client } = fixture();
    const state = { picks: { U7: { 0: [1] }, U8: { 0: [0] } } };

    const change = await discordQuestions.updated!(hookArgs(client, state));

    expect(change).toEqual({ state: expect.objectContaining({ q: 0, picks: {} }) });
  });

  it('retires the card with one edit naming the responder without pinging them', async () => {
    const { client, requests } = fixture();

    await discordQuestions.settled({
      ...hookArgs(client),
      actor: {
        user: null,
        channel: { piece: 'discord', account: 'discord', id: 'U7', name: 'Toad', username: 'toad' },
      },
      outcome: {
        output: {
          answers: [
            { header: 'Colors', selected: ['Red'] },
            { header: 'Size', selected: ['S'] },
          ],
        },
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'PATCH',
      path: '/channels/T1/messages/900',
      body: { flags: 32768, allowed_mentions: { parse: [] } },
    });
    expect(JSON.stringify(requests[0].body)).toContain('Answered by **Toad** (@toad)');
    expect(JSON.stringify(requests[0].body)).not.toContain('custom_id');
  });

  it('retires a card answered elsewhere without naming anyone', async () => {
    const { client, requests } = fixture();

    await discordQuestions.settled({
      ...hookArgs(client),
      actor: null,
      outcome: { dismissed: true },
    });

    expect(JSON.stringify(requests[0].body)).toContain('-# Dismissed');
    expect(JSON.stringify(requests[0].body)).not.toContain('<@');
  });

  it('tells a denied participant in the thread, mentioning only them', async () => {
    const { client, requests } = fixture();

    await discordQuestions.denied!({ ...hookArgs(client), interaction: click('dismiss') });

    expect(requests).toEqual([
      {
        method: 'POST',
        path: '/channels/T1/messages',
        body: {
          content: "<@U7> You don't have access to answer this question.",
          allowed_mentions: { users: ['U7'] },
          message_reference: { message_id: '900', fail_if_not_exists: false },
        },
      },
    ]);
  });

  it('explains a rejected typed reply as a reply to that message', async () => {
    const { client, requests } = fixture();
    const interaction = {
      type: 'message',
      message: { id: '555', author: { userId: 'U8' } },
    } as unknown as QuestionInteraction;

    await discordQuestions.rejected!({ ...hookArgs(client), interaction, reason: 'Try again.' });

    expect(requests[0].body).toEqual({
      content: '<@U8> Try again.',
      allowed_mentions: { users: ['U8'] },
      message_reference: { message_id: '555', fail_if_not_exists: false },
    });
  });

  it('propagates a Discord error from a hook', async () => {
    const client = {
      request: vi.fn(() =>
        Promise.reject(new Error('Discord request failed (403): Missing Access')),
      ),
    } as unknown as DiscordClient;

    await expect(
      discordQuestions.denied!({ ...hookArgs(client), interaction: click('dismiss') }),
    ).rejects.toThrow('Missing Access');
  });

  it('offers questions everywhere and leaves stale clicks alone', () => {
    expect(discordQuestions.supports).toBeUndefined();
    expect(discordQuestions.stale).toBeUndefined();
  });

  it('wires questions into the Discord channel', () => {
    const definition = pieceFactoryDefinition(createDiscord);

    expect(definition.channel?.questions).toBe(discordQuestions);
  });

  it('sends piece client requests to a configured API URL', async () => {
    const fetch = vi.fn((_url: string | URL | Request) =>
      Promise.resolve(new Response(JSON.stringify({ id: '1' }))),
    );

    vi.stubGlobal('fetch', fetch);

    await createDiscordClient({
      auth: { botToken: 'token' },
      options: { apiUrl: 'http://127.0.0.1:9999/api/v10/' },
    }).request({ path: '/channels/1/messages' });

    await createDiscordClient({ auth: { botToken: 'token' } }).request({ path: '/users/@me' });

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:9999/api/v10/channels/1/messages',
      'https://discord.com/api/v10/users/@me',
    ]);
  });
});
