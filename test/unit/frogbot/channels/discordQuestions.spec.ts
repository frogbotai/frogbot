import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingCall } from '../../../../packages/frogbot/src/chat/turn/types.js';
import { question } from '../../../../packages/frogbot/src/tools/question.js';
import { createDiscordAdapter } from '../../../../packages/pieces/piece-discord/node_modules/@chat-adapter/discord/dist/index.js';
import { createDiscordClient } from '../../../../packages/pieces/piece-discord/src/client.js';
import {
  callKey,
  encodeQuestionId,
} from '../../../../packages/pieces/piece-discord/src/questions/ids.js';
import { discordQuestions } from '../../../../packages/pieces/piece-discord/src/questions/index.js';
import {
  componentClick,
  type DiscordApi,
  discordApplicationId,
  discordBotToken,
  discordPublicKey,
  forwardedGateway,
  gatewayMessage,
  signedInteraction,
  startDiscordApi,
} from './discordFixtures.js';
import { channelFixture } from './helpers.js';

vi.mock('frogbot/pieces', () => import('../../../../packages/frogbot/src/exports/pieces.js'));

const { continueTurn, listPendingCalls, settleClientToolCall } = vi.hoisted(() => ({
  continueTurn: vi.fn(),
  listPendingCalls: vi.fn(),
  settleClientToolCall: vi.fn(),
}));

vi.mock('../../../../packages/frogbot/src/chat/turn/settle.js', () => ({
  listPendingCalls,
  settleClientToolCall,
}));

vi.mock('../../../../packages/frogbot/src/chat/turn/continueTurn.js', () => ({ continueTurn }));

type Fixture = ReturnType<typeof channelFixture>;

type Location = { guildId: string | null; parentId: string | null; threadId: string };

const thread: Location = { guildId: 'G1', parentId: 'C1', threadId: 'T1' };
const forum: Location = { guildId: 'G1', parentId: 'F1', threadId: 'P1' };
const dm: Location = { guildId: null, parentId: null, threadId: 'D1' };

const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };

let api: DiscordApi;
const fixtures: Fixture[] = [];

function pendingCall({
  toolCallId = 'call-1',
  questions = [
    {
      header: 'Color',
      question: 'Pick a color',
      options: [{ label: 'Red' }, { label: 'Blue' }],
      custom: true,
    },
  ],
}: {
  toolCallId?: string;
  questions?: Array<Record<string, unknown>>;
} = {}): PendingCall {
  return {
    toolCallId,
    toolName: 'question',
    input: { questions },
    messageId: 'assistant-1',
    chatId: 'chat-1',
    agentSlug: 'support',
    createdAt: '2026-09-25T00:00:00.000Z',
  };
}

function control(
  verb: Parameters<typeof encodeQuestionId>[0]['verb'],
  n?: number,
  q = 0,
  id = 'call-1',
) {
  return encodeQuestionId({ key: callKey(id), q, verb, n });
}

async function asked({
  calls = [pendingCall()],
  location = thread,
}: {
  calls?: PendingCall[];
  location?: Location;
} = {}) {
  const fixture = channelFixture({
    slug: 'discord',
    adapter: createDiscordAdapter({
      apiUrl: api.url,
      applicationId: discordApplicationId,
      botToken: discordBotToken,
      publicKey: discordPublicKey,
      logger: silent as never,
    }),
    client: createDiscordClient({
      auth: { botToken: discordBotToken },
      options: { apiUrl: api.url },
    }),
    questions: discordQuestions as never,
  });

  fixtures.push(fixture);

  Object.assign(fixture.frogbot.agents.support.config, { tools: [question] });

  await fixture.host.initialize(false);
  await fixture.host.webhook(
    'discord',
    forwardedGateway({
      body: gatewayMessage({
        content: 'Paint it',
        mention: location.parentId !== null,
        starter: true,
        ...location,
      }),
    }),
  );

  listPendingCalls.mockResolvedValueOnce(calls);

  await fixture.host.run(JSON.parse(JSON.stringify(fixture.inputs[0])));

  return { fixture, messageId: api.cards(location.threadId).at(-1)?.id ?? '' };
}

async function click({
  fixture,
  location = thread,
  messageId,
  ...args
}: {
  fixture: Fixture;
  location?: Location;
  messageId: string;
  customId: string;
  user?: string;
  values?: string[];
}) {
  const response = await fixture.host.webhook(
    'discord',
    signedInteraction({ body: componentClick({ messageId, ...location, ...args }) }),
  );

  return response?.json();
}

async function say({
  fixture,
  location = thread,
  content,
  mention = false,
  user = 'U2',
}: {
  fixture: Fixture;
  location?: Location;
  content: string;
  mention?: boolean;
  user?: string;
}) {
  const before = fixture.inputs.length;

  await fixture.host.webhook(
    'discord',
    forwardedGateway({ body: gatewayMessage({ content, mention, user, ...location }) }),
  );

  await fixture.host.run(JSON.parse(JSON.stringify(fixture.inputs[before])));
}

function admit(fixture: Fixture, ids: string[]) {
  fixture.access.mockImplementation(((args: {
    req: { context?: { channel?: { author: { id: string } } } };
  }) => ids.includes(args.req.context?.channel?.author.id ?? '')) as never);
}

const typedColor = pendingCall({
  questions: [{ header: 'Color', question: 'Color?', options: [{ label: 'Red' }], custom: true }],
});

const colorSet = pendingCall({
  questions: [
    { header: 'Color', question: 'Color?', options: [{ label: 'Red' }, { label: 'Blue' }] },
    { header: 'Size', question: 'Size?', options: [{ label: 'S' }, { label: 'L' }] },
  ],
});

const bigMulti = pendingCall({
  questions: [
    {
      header: 'Pick',
      question: 'Pick many',
      options: Array.from({ length: 400 }, (_, index) => ({ label: `O${index}` })),
      multiple: true,
      custom: true,
    },
  ],
});

function since(before: number) {
  return api.calls.slice(before);
}

describe('Discord native questions through the channel host', () => {
  beforeAll(async () => {
    api = await startDiscordApi();
  });

  afterAll(async () => {
    await api.close();
  });

  beforeEach(() => {
    api.reset();
    listPendingCalls.mockReset().mockResolvedValue([]);
    settleClientToolCall.mockReset().mockResolvedValue({
      status: 'settled',
      part: {},
      allSettled: true,
    });
    continueTurn.mockReset();
  });

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map(({ host }) => host.shutdown()));
  });

  it.each([
    ['a guild thread', thread],
    ['a forum post', forum],
    ['a DM', dm],
  ])('offers the question tool and posts a components-v2 card in %s', async (_, location) => {
    const { fixture, messageId } = await asked({ location });
    const [card] = api.cards(location.threadId);

    expect(fixture.streamMessage.mock.calls[0]![0].clientTools).toEqual({ kinds: ['question'] });
    expect(messageId).toMatch(/^\d+$/);
    expect(card!.body).toMatchObject({ flags: 32768, allowed_mentions: { parse: [] } });
    expect(JSON.stringify(card!.body)).toContain(control('option', 1));
  });
  it('settles a click, retires the card in one edit, and queues one continuation', async () => {
    const { fixture, messageId } = await asked();
    const before = api.calls.length;

    const response = await click({ fixture, messageId, customId: control('option', 1) });

    expect(response).toEqual({ type: 6 });
    expect(settleClientToolCall.mock.calls[0]![0]).toMatchObject({
      outcome: { output: { answers: [{ header: 'Color', selected: ['Blue'] }] } },
      actor: {
        user: null,
        channel: { piece: 'discord', account: 'discord', id: 'U2', username: 'user-u2' },
      },
    });
    expect(since(before)).toEqual([
      expect.objectContaining({ method: 'PATCH', path: `/channels/T1/messages/${messageId}` }),
    ]);
    expect(JSON.stringify(since(before)[0]!.body)).toContain('Answered by **User U2**');
    expect(fixture.inputs.at(-1)).toMatchObject({ kind: 'continue', responder: { userId: 'U2' } });
  });

  it('ignores a second click on an answered card without calling Discord', async () => {
    const { fixture, messageId } = await asked();

    await click({ fixture, messageId, customId: control('option', 0) });

    const before = api.calls.length;
    const jobs = fixture.inputs.length;

    expect(await click({ fixture, messageId, customId: control('option', 1), user: 'U3' })).toEqual(
      {
        type: 6,
      },
    );
    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(since(before)).toEqual([]);
    expect(fixture.inputs).toHaveLength(jobs);
  });

  it('tells a participant without access in the thread and keeps the question open', async () => {
    const { fixture, messageId } = await asked();
    const before = api.calls.length;

    fixture.access.mockReturnValue(false);

    await click({ fixture, messageId, customId: control('custom'), user: 'U9' });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(since(before)).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/channels/T1/messages',
        body: {
          content: "<@U9> You don't have access to answer this question.",
          allowed_mentions: { users: ['U9'] },
          message_reference: { message_id: messageId, fail_if_not_exists: false },
        },
      }),
    ]);
  });

  it('rejects a click with a bad signature', async () => {
    const { fixture, messageId } = await asked();
    const before = api.calls.length;

    const response = await fixture.host.webhook(
      'discord',
      signedInteraction({
        body: componentClick({ messageId, customId: control('option', 0) }),
        valid: false,
      }),
    );

    expect(response?.status).toBe(401);
    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(since(before)).toEqual([]);
  });

  it('ignores the same card id relayed from another channel', async () => {
    const { fixture, messageId } = await asked();
    const before = api.calls.length;

    await click({
      fixture,
      messageId,
      customId: control('dismiss'),
      location: { guildId: 'G1', parentId: 'C2', threadId: 'T2' },
    });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(since(before)).toEqual([]);
  });

  it('keeps multi-select picks silent and submits only the submitter’s picks', async () => {
    const { fixture, messageId } = await asked({
      calls: [
        pendingCall({
          questions: [
            {
              header: 'Colors',
              question: 'Pick colors',
              options: [{ label: 'Red' }, { label: 'Blue' }, { label: 'Green' }],
              multiple: true,
              custom: false,
            },
          ],
        }),
      ],
    });
    const before = api.calls.length;

    await click({ fixture, messageId, customId: control('select', 0), values: ['2', '0'] });
    await click({ fixture, messageId, customId: control('select', 0), values: ['1'], user: 'U3' });

    expect(since(before)).toEqual([]);

    await click({ fixture, messageId, customId: control('submit') });

    expect(settleClientToolCall.mock.calls[0]![0].outcome).toEqual({
      output: { answers: [{ header: 'Colors', selected: ['Red', 'Green'] }] },
    });
  });

  it('explains an empty Submit in the thread', async () => {
    const { fixture, messageId } = await asked({
      calls: [
        pendingCall({
          questions: [
            { header: 'Colors', question: 'Pick', options: [{ label: 'Red' }], multiple: true },
          ],
        }),
      ],
    });
    const before = api.calls.length;

    await click({ fixture, messageId, customId: control('submit') });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(since(before)).toEqual([
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          content: '<@U2> Pick at least one option first, or press **Other…** to type an answer.',
        }),
      }),
    ]);
  });

  it('walks a question set with one edit per step, then settles every answer', async () => {
    const { fixture, messageId } = await asked({
      calls: [
        pendingCall({
          questions: [
            { header: 'Color', question: 'Color?', options: [{ label: 'Red' }, { label: 'Blue' }] },
            { header: 'Size', question: 'Size?', options: [{ label: 'S' }, { label: 'L' }] },
          ],
        }),
      ],
    });

    await click({ fixture, messageId, customId: control('option', 1) });

    const edits = api.edits('T1', messageId);

    expect(edits).toHaveLength(1);
    expect(JSON.stringify(edits[0]!.body)).toContain('**Size** · 2 of 2');
    expect(settleClientToolCall).not.toHaveBeenCalled();

    await click({ fixture, messageId, customId: control('option', 0, 0) });

    expect(settleClientToolCall).not.toHaveBeenCalled();

    await click({ fixture, messageId, customId: control('option', 0, 1), user: 'U3' });

    expect(settleClientToolCall.mock.calls[0]![0].outcome).toEqual({
      output: {
        answers: [
          { header: 'Color', selected: ['Blue'] },
          { header: 'Size', selected: ['S'] },
        ],
      },
    });
    expect(api.edits('T1', messageId)).toHaveLength(2);
  });

  it('captures the armed participant’s unmentioned reply and consumes it', async () => {
    const { fixture, messageId } = await asked();

    await click({ fixture, messageId, customId: control('custom') });

    expect(JSON.stringify(api.edits('T1', messageId)[0]!.body)).toContain(
      '**User U2**, reply in this thread',
    );

    const turns = fixture.streamMessage.mock.calls.length;

    await say({ fixture, content: 'Teal, please' });

    expect(settleClientToolCall.mock.calls[0]![0]).toMatchObject({
      outcome: { output: { answers: [{ header: 'Color', selected: [], custom: 'Teal, please' }] } },
      actor: { channel: { id: 'U2' } },
    });
    expect(fixture.streamMessage.mock.calls).toHaveLength(turns);
    expect(fixture.inputs.at(-1)).toMatchObject({ kind: 'continue' });
  });

  it('treats a bystander’s reply as an ordinary message while someone is typing', async () => {
    const { fixture, messageId } = await asked();

    await click({ fixture, messageId, customId: control('custom') });

    const turns = fixture.streamMessage.mock.calls.length;

    await say({ fixture, content: 'Unrelated', user: 'U3' });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.streamMessage.mock.calls).toHaveLength(turns + 1);
  });

  it('dismisses without queueing a continuation', async () => {
    const { fixture, messageId } = await asked();
    const jobs = fixture.inputs.length;

    await click({ fixture, messageId, customId: control('dismiss') });

    expect(settleClientToolCall.mock.calls[0]![0].outcome).toEqual({ dismissed: true });
    expect(JSON.stringify(api.edits('T1', messageId)[0]!.body)).toContain(
      'Dismissed by **User U2**',
    );
    expect(fixture.inputs).toHaveLength(jobs);
  });

  it.each([
    ['a forum post', forum],
    ['a DM', dm],
  ])('settles a click in %s', async (_, location) => {
    const { fixture, messageId } = await asked({ location });

    await click({ fixture, location, messageId, customId: control('option', 0) });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(api.edits(location.threadId, messageId)).toHaveLength(1);
  });

  it('posts the next call’s card after the first is answered', async () => {
    const { fixture, messageId } = await asked({
      calls: [pendingCall(), pendingCall({ toolCallId: 'call-2' })],
    });

    expect(api.cards('T1')).toHaveLength(1);

    settleClientToolCall.mockResolvedValueOnce({ status: 'settled', part: {}, allSettled: false });
    listPendingCalls.mockResolvedValueOnce([pendingCall({ toolCallId: 'call-2' })]);

    await click({ fixture, messageId, customId: control('option', 0) });

    const cards = api.cards('T1');

    expect(cards).toHaveLength(2);
    expect(JSON.stringify(cards[1]!.body)).toContain(control('option', 0, 0, 'call-2'));
    expect(fixture.inputs.filter(({ kind }) => kind === 'continue')).toEqual([]);
  });

  it('still queues the continuation when retiring the card fails', async () => {
    const { fixture, messageId } = await asked();

    api.failures.set(`PATCH /channels/T1/messages/${messageId}`, {
      status: 500,
      message: 'Discord is down',
    });

    await click({ fixture, messageId, customId: control('option', 0) });

    expect(fixture.inputs.at(-1)).toMatchObject({ kind: 'continue' });
    expect(fixture.frogbot.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ piece: 'discord', toolCallId: 'call-1' }),
      "[frogbot] Channel question 'settled' hook failed.",
    );
  });
  it('keeps a set unchanged when a participant without access answers its first question', async () => {
    const { fixture, messageId } = await asked({ calls: [colorSet] });

    admit(fixture, ['U2', 'U3']);

    const before = api.calls.length;

    await click({ fixture, messageId, customId: control('option', 1), user: 'U9' });

    expect(since(before)).toEqual([
      expect.objectContaining({ method: 'POST', path: '/channels/T1/messages' }),
    ]);

    await click({ fixture, messageId, customId: control('option', 0), user: 'U3' });

    expect(JSON.stringify(api.edits('T1', messageId)[0]!.body)).toContain('✓ Color: Red');
  });

  it('does not let a participant without access page, pick, submit, or press Other…', async () => {
    const { fixture, messageId } = await asked({ calls: [bigMulti] });

    admit(fixture, ['U2']);

    await click({ fixture, messageId, customId: control('page', 1), user: 'U9' });
    await click({ fixture, messageId, customId: control('select', 0), values: ['1'], user: 'U9' });
    await click({ fixture, messageId, customId: control('submit'), user: 'U9' });
    await click({ fixture, messageId, customId: control('custom'), user: 'U9' });

    expect(api.edits('T1', messageId)).toEqual([]);
    expect(settleClientToolCall).not.toHaveBeenCalled();

    await click({ fixture, messageId, customId: control('submit') });

    expect(settleClientToolCall).not.toHaveBeenCalled();
  });

  it('makes one Discord call to change page and one to press Other…', async () => {
    const { fixture, messageId } = await asked({ calls: [bigMulti] });
    const before = api.calls.length;

    await click({ fixture, messageId, customId: control('page', 1) });
    await click({ fixture, messageId, customId: control('custom') });

    expect(since(before).map(({ method, path }) => `${method} ${path}`)).toEqual([
      `PATCH /channels/T1/messages/${messageId}`,
      `PATCH /channels/T1/messages/${messageId}`,
    ]);
    expect(since(before)[0]!.body).toMatchObject({ flags: 32768, allowed_mentions: { parse: [] } });
  });

  it('arms once when the same Other… click is delivered twice', async () => {
    const { fixture, messageId } = await asked({ calls: [typedColor] });
    const body = componentClick({ messageId, customId: control('custom'), ...thread });

    await fixture.host.webhook('discord', signedInteraction({ body }));
    await fixture.host.webhook('discord', signedInteraction({ body }));

    expect(api.edits('T1', messageId)).toHaveLength(1);

    await say({ fixture, content: 'Teal' });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
  });

  it('captures an armed reply that mentions the bot, without the mention', async () => {
    const { fixture, messageId } = await asked({ calls: [typedColor] });

    await click({ fixture, messageId, customId: control('custom') });
    await say({ fixture, content: `<@${discordApplicationId}> Teal`, mention: true });

    expect(settleClientToolCall.mock.calls[0]![0].outcome).toEqual({
      output: { answers: [{ header: 'Color', selected: [], custom: 'Teal' }] },
    });
  });

  it('does not consume an armed participant’s message in another thread', async () => {
    const { fixture, messageId } = await asked({ calls: [typedColor] });

    await click({ fixture, messageId, customId: control('custom') });

    api.parents.set('T7', 'C1');

    await fixture.host.webhook(
      'discord',
      forwardedGateway({
        body: gatewayMessage({
          content: 'Elsewhere',
          mention: true,
          starter: true,
          threadId: 'T7',
          user: 'U2',
        }),
      }),
    );
    await fixture.host.run(JSON.parse(JSON.stringify(fixture.inputs.at(-1))));

    expect(settleClientToolCall).not.toHaveBeenCalled();
  });

  it('tells an armed participant who lost access, and does not settle', async () => {
    const { fixture, messageId } = await asked({ calls: [typedColor] });

    await click({ fixture, messageId, customId: control('custom') });

    fixture.access.mockReturnValue(false);

    const before = api.calls.length;

    await say({ fixture, content: 'Teal' });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(since(before).filter(({ method }) => method !== 'GET')).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/channels/T1/messages',
        body: expect.objectContaining({
          content: "<@U2> You don't have access to answer this question.",
          allowed_mentions: { users: ['U2'] },
        }),
      }),
    ]);
  });

  it('lets an armed participant’s later message through once someone else answered', async () => {
    const { fixture, messageId } = await asked({ calls: [typedColor] });

    await click({ fixture, messageId, customId: control('custom') });
    await click({ fixture, messageId, customId: control('option', 0), user: 'U3' });

    const turns = fixture.streamMessage.mock.calls.length;

    await say({ fixture, content: 'Teal' });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(fixture.streamMessage.mock.calls).toHaveLength(turns + 1);
  });
});
