import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encodeQuestionModalMetadata } from '../../../../packages/frogbot/src/channels/questions/questionModalMetadata.js';
import type {
  PieceChannelQuestions,
  QuestionInteraction,
} from '../../../../packages/frogbot/src/channels/questions/types.js';
import { hasChannelChatAccess } from '../../../../packages/frogbot/src/chat/channelAccess.js';
import { TurnError } from '../../../../packages/frogbot/src/chat/turn/errors.js';
import type { PendingCall } from '../../../../packages/frogbot/src/chat/turn/types.js';
import { question } from '../../../../packages/frogbot/src/tools/question.js';
import { channelFixture } from './helpers.js';

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

const thread = 'channel:thread-1';

const output = { answers: [{ header: 'Color', selected: ['Red'] }] };

function pendingCall(toolCallId = 'call-1'): PendingCall {
  return {
    toolCallId,
    toolName: 'question',
    input: {
      questions: [
        {
          header: 'Color',
          question: 'Pick one',
          options: [{ label: 'Red' }, { label: 'Blue' }],
          custom: true,
        },
      ],
    },
    messageId: 'assistant-1',
    chatId: 'chat-1',
    agentSlug: 'support',
    createdAt: '2026-09-25T00:00:00.000Z',
  };
}

function parseInteraction(interaction: QuestionInteraction) {
  const id =
    interaction.type === 'action'
      ? interaction.event.actionId
      : interaction.type === 'modalSubmit'
        ? 'answer'
        : interaction.message.text;

  if (id === 'answer') return { kind: 'answer' as const, output };

  if (id === 'dismiss') return { kind: 'dismiss' as const };

  if (id === 'partial') return { kind: 'partial' as const, state: { step: 2 } };

  if (id === 'bad') return { kind: 'rejected' as const, reason: 'Pick an option.' };

  return { kind: 'ignore' as const };
}

function questionHooks() {
  return {
    render: vi.fn<PieceChannelQuestions['render']>(async ({ calls }) => [
      { messageId: 'card-1', calls: calls.map(({ toolCallId }) => toolCallId) },
    ]),
    parse: vi.fn<PieceChannelQuestions['parse']>(({ interaction }) =>
      parseInteraction(interaction),
    ),
    settled: vi.fn<PieceChannelQuestions['settled']>(async () => {}),
    updated: vi.fn<NonNullable<PieceChannelQuestions['updated']>>(async () => {}),
    rejected: vi.fn<NonNullable<PieceChannelQuestions['rejected']>>(async () => {}),
    denied: vi.fn<NonNullable<PieceChannelQuestions['denied']>>(async () => {}),
    stale: vi.fn<NonNullable<PieceChannelQuestions['stale']>>(async () => {}),
  };
}

async function askedFixture(hooks = questionHooks()) {
  const fixture = channelFixture({ questions: hooks });

  Object.assign(fixture.frogbot.agents.support.config, { tools: [question] });
  fixture.identity.mockResolvedValue({ id: 'user-1', collection: 'users' } as never);

  await fixture.host.initialize(false);
  await fixture.deliver();

  listPendingCalls.mockResolvedValueOnce([pendingCall()]);

  await fixture.host.run(fixture.inputs[0]!);

  return { fixture, hooks };
}

function click(actionId: string, extra: Record<string, unknown> = {}) {
  return { type: 'action', actionId, messageId: 'card-1', threadId: thread, ...extra };
}

describe('channel question availability', () => {
  beforeEach(() => {
    listPendingCalls.mockReset().mockResolvedValue([]);
  });

  it('offers questions only when the piece can answer them in this thread', async () => {
    const kinds = async (questions?: PieceChannelQuestions) => {
      const fixture = channelFixture({ questions });

      await fixture.host.initialize(false);
      await fixture.deliver();
      await fixture.host.run(fixture.inputs[0]!);
      await fixture.host.shutdown();

      return {
        kinds: fixture.streamMessage.mock.calls[0]![0].clientTools?.kinds,
        logged: fixture.frogbot.logger.error.mock.calls.length,
      };
    };

    const supports = (value: () => boolean) => ({ ...questionHooks(), supports: value });

    expect(await kinds()).toEqual({ kinds: [], logged: 0 });
    expect(await kinds(questionHooks())).toEqual({ kinds: ['question'], logged: 0 });
    expect(await kinds(supports(() => false))).toEqual({ kinds: [], logged: 0 });
    expect(
      await kinds(
        supports(() => {
          throw new Error('unsupported');
        }),
      ),
    ).toEqual({ kinds: [], logged: 1 });
  });
});

describe('channel question delivery', () => {
  beforeEach(() => {
    listPendingCalls.mockReset().mockResolvedValue([]);
    settleClientToolCall.mockReset().mockResolvedValue({
      status: 'settled',
      part: {},
      allSettled: true,
    });
    continueTurn.mockReset().mockImplementation(async () => ({
      stream: (async function* () {
        yield 'Continued';
      })(),
      persistence: Promise.resolve(),
    }));
  });

  it('renders a pending question once and records its delivery', async () => {
    const { fixture, hooks } = await askedFixture();

    await fixture.deliver('message-2', thread, { mention: false });

    fixture.streamMessage.mockResolvedValueOnce({
      status: 'queued',
      chatId: 'chat-1',
      messageId: 'message-2',
      delivery: 'queue',
    } as never);
    listPendingCalls.mockResolvedValueOnce([pendingCall()]);

    await fixture.host.run(fixture.inputs[1]!);

    expect(hooks.render).toHaveBeenCalledOnce();
    expect(hooks.render.mock.calls[0]![0].calls[0]!.input.questions[0]!.header).toBe('Color');
    expect(fixture.values.get('channels:support:slack:questions:message:channel:card-1')).toEqual({
      chatId: 'chat-1',
      toolCallIds: ['call-1'],
    });
    expect(fixture.values.get('channels:support:slack:questions:call:chat-1:call-1')).toMatchObject(
      {
        chatId: 'chat-1',
        messageId: 'card-1',
        thread: { id: thread },
      },
    );

    await fixture.host.shutdown();
  });

  it('renders a missing card on the next message when the first render failed', async () => {
    const hooks = questionHooks();

    hooks.render.mockRejectedValueOnce(new Error('Slack is down'));

    const fixture = channelFixture({ questions: hooks });

    Object.assign(fixture.frogbot.agents.support.config, { tools: [question] });

    await fixture.host.initialize(false);
    await fixture.deliver();

    listPendingCalls.mockResolvedValueOnce([pendingCall()]);

    await expect(fixture.host.run(fixture.inputs[0]!)).rejects.toThrow('Slack is down');

    await fixture.deliver('message-2', thread, { mention: false });

    fixture.streamMessage.mockResolvedValueOnce({ status: 'queued' } as never);
    listPendingCalls.mockResolvedValueOnce([pendingCall()]);

    await fixture.host.run(fixture.inputs[1]!);

    expect(hooks.render).toHaveBeenCalledTimes(2);
    expect(fixture.values.has('channels:support:slack:questions:call:chat-1:call-1')).toBe(true);

    await fixture.host.shutdown();
  });

  it('keeps calls the piece held back until an open card is answered', async () => {
    const hooks = questionHooks();

    hooks.render.mockImplementation(async ({ calls }) => [
      { messageId: 'card-1', calls: [calls[0]!.toolCallId] },
    ]);

    const fixture = channelFixture({ questions: hooks });

    Object.assign(fixture.frogbot.agents.support.config, { tools: [question] });

    await fixture.host.initialize(false);
    await fixture.deliver();

    listPendingCalls.mockResolvedValueOnce([pendingCall('call-1'), pendingCall('call-2')]);

    await fixture.host.run(fixture.inputs[0]!);
    await fixture.deliver('message-2', thread, { mention: false });

    fixture.streamMessage.mockResolvedValueOnce({ status: 'queued' } as never);
    listPendingCalls.mockResolvedValueOnce([pendingCall('call-1'), pendingCall('call-2')]);

    await fixture.host.run(fixture.inputs[1]!);

    expect(hooks.render).toHaveBeenCalledOnce();
    expect(fixture.values.has('channels:support:slack:questions:call:chat-1:call-2')).toBe(false);

    await fixture.host.shutdown();
  });

  it('posts nothing for a question-only step', async () => {
    const fixture = channelFixture({ questions: questionHooks() });

    fixture.streamMessage.mockResolvedValueOnce({
      stream: (async function* () {
        yield { type: 'tool-call', toolName: 'question' };
        yield '  ';
      })(),
      persistence: Promise.resolve(),
    } as never);

    await fixture.host.initialize(false);
    await fixture.deliver();
    await fixture.host.run(fixture.inputs[0]!);

    expect(fixture.posted).toEqual([]);

    await fixture.host.shutdown();
  });

  it('settles an authorized answer, updates the card, and queues one continuation', async () => {
    const { fixture, hooks } = await askedFixture();

    await fixture.interact(click('answer', { author: 'user-2' }));

    const settle = settleClientToolCall.mock.calls[0]![0];

    expect(settle).toMatchObject({
      chatId: 'chat-1',
      toolCallId: 'call-1',
      outcome: { output },
      actor: {
        user: { collection: 'users', id: 'user-1' },
        channel: { piece: 'slack', account: 'slack', id: 'user-2' },
      },
    });
    expect(
      hasChannelChatAccess({
        access: settle.channelAccess,
        req: settle.req,
        agentSlug: 'support',
        chat: { ...fixture.frogbot.create.mock.calls[0]![0].data, id: 'chat-1', agent: 'support' },
      }),
    ).toBe(true);
    expect(hooks.settled).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'card-1', outcome: { output } }),
    );
    expect(fixture.inputs[1]).toMatchObject({
      kind: 'continue',
      chatId: 'chat-1',
      thread: { id: thread },
      responder: { userId: 'user-2' },
    });

    await fixture.host.run(JSON.parse(JSON.stringify(fixture.inputs[1])));

    expect(continueTurn).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'chat-1', clientTools: { kinds: ['question'] } }),
    );
    expect(fixture.posted.at(-1)).toEqual({ threadId: thread, text: 'Continued' });
    expect(listPendingCalls).toHaveBeenCalledTimes(2);

    await fixture.host.shutdown();
  });

  it('tells a second click the question was already answered', async () => {
    const { fixture, hooks } = await askedFixture();

    await fixture.interact(click('answer'));
    await fixture.interact(click('answer'));

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(hooks.stale).toHaveBeenCalledOnce();
    expect(fixture.inputs.filter((input) => input.kind === 'continue')).toHaveLength(1);

    await fixture.host.shutdown();
  });

  it('denies a responder without agent access and leaves the call pending', async () => {
    const { fixture, hooks } = await askedFixture();

    fixture.access.mockReturnValue(false);

    await fixture.interact(click('answer'));

    expect(hooks.denied).toHaveBeenCalledOnce();
    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(
      fixture.values.get('channels:support:slack:questions:call:chat-1:call-1'),
    ).not.toHaveProperty('settled');

    await fixture.host.shutdown();
  });

  it.each([
    ['another thread', { threadId: 'other:thread-1' }],
    ['an unknown card', { messageId: 'card-2' }],
    ['a checkbox tick', { actionId: 'tick' }],
  ])('ignores %s without resolving identity', async (_name, extra) => {
    const { fixture, hooks } = await askedFixture();

    fixture.identity.mockClear();

    await fixture.interact(click('answer', extra));

    expect(fixture.identity).not.toHaveBeenCalled();
    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(hooks.stale).not.toHaveBeenCalled();

    await fixture.host.shutdown();
  });

  it('persists partial state, then passes it to later hooks and a moved card', async () => {
    const { fixture, hooks } = await askedFixture();

    hooks.updated.mockResolvedValueOnce({ messageId: 'card-2' });

    await fixture.interact(click('partial'));

    expect(hooks.updated).toHaveBeenCalledWith(expect.objectContaining({ state: { step: 2 } }));
    expect(fixture.values.get('channels:support:slack:questions:call:chat-1:call-1')).toMatchObject(
      {
        messageId: 'card-2',
        state: { step: 2 },
      },
    );

    await fixture.interact(click('answer', { messageId: 'card-2' }));

    expect(hooks.settled).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'card-2', state: { step: 2 } }),
    );

    await fixture.host.shutdown();
  });

  it('explains a rejected submission without settling', async () => {
    const { fixture, hooks } = await askedFixture();

    await fixture.interact(click('bad'));

    expect(hooks.rejected).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Pick an option.' }),
    );
    expect(settleClientToolCall).not.toHaveBeenCalled();

    await fixture.host.shutdown();
  });

  it('stops the turn on dismissal without queueing a continuation', async () => {
    const { fixture, hooks } = await askedFixture();

    await fixture.interact(click('dismiss'));

    expect(settleClientToolCall.mock.calls[0]![0].outcome).toEqual({ dismissed: true });
    expect(hooks.settled).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: { dismissed: true } }),
    );
    expect(fixture.inputs).toHaveLength(1);

    await fixture.host.shutdown();
  });

  it('corrects a card answered elsewhere and tells the clicker', async () => {
    const { fixture, hooks } = await askedFixture();

    settleClientToolCall.mockResolvedValueOnce({
      status: 'already-settled',
      part: { state: 'output-available', output },
      allSettled: true,
    });

    await fixture.interact(click('answer'));

    expect(hooks.settled).toHaveBeenCalledWith(
      expect.objectContaining({ actor: null, outcome: { output } }),
    );
    expect(hooks.stale).toHaveBeenCalledOnce();
    expect(fixture.inputs).toHaveLength(1);

    await fixture.host.shutdown();
  });

  it('renders the next call instead of continuing while siblings are pending', async () => {
    const { fixture, hooks } = await askedFixture();

    settleClientToolCall.mockResolvedValueOnce({ status: 'settled', part: {}, allSettled: false });
    listPendingCalls.mockResolvedValueOnce([pendingCall('call-2')]);

    await fixture.interact(click('answer'));

    expect(hooks.render).toHaveBeenCalledTimes(2);
    expect(hooks.render.mock.calls[1]![0].calls.map(({ toolCallId }) => toolCallId)).toEqual([
      'call-2',
    ]);
    expect(fixture.inputs).toHaveLength(1);

    await fixture.host.shutdown();
  });

  it('queues the continuation even when the card update fails', async () => {
    const { fixture, hooks } = await askedFixture();

    hooks.settled.mockRejectedValueOnce(new Error('chat.update failed'));

    await fixture.interact(click('answer'));

    expect(fixture.inputs[1]).toMatchObject({ kind: 'continue' });
    expect(fixture.frogbot.logger.error).toHaveBeenCalledOnce();

    await fixture.host.shutdown();
  });

  it.each([
    ['forbidden', new TurnError('forbidden', 'No.'), 'denied'],
    ['a new turn', new TurnError('call-not-found', 'Gone.'), 'stale'],
    ['invalid output', new TurnError('invalid-output', 'Answer every question.'), 'rejected'],
  ] as const)('maps %s from settlement to a notice', async (_name, error, hook) => {
    const { fixture, hooks } = await askedFixture();

    settleClientToolCall.mockRejectedValueOnce(error);

    await fixture.interact(click('answer'));

    expect(hooks[hook]).toHaveBeenCalledOnce();
    expect(fixture.inputs).toHaveLength(1);

    await fixture.host.shutdown();
  });

  it('settles a modal submission located by its metadata', async () => {
    const { fixture, hooks } = await askedFixture();

    await fixture.interact({
      type: 'modal',
      privateMetadata: encodeQuestionModalMetadata({ threadId: thread, messageId: 'card-1' }),
    });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(hooks.settled).toHaveBeenCalledOnce();

    await fixture.host.shutdown();
  });

  it('consumes an answering thread reply and queues ordinary replies', async () => {
    const { fixture } = await askedFixture();

    await fixture.deliver('message-2', thread, { mention: false, text: 'answer' });
    await fixture.host.run(fixture.inputs[1]!);

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(fixture.streamMessage).toHaveBeenCalledOnce();

    await fixture.deliver('message-3', thread, { mention: false, text: 'answer' });
    await fixture.host.run(fixture.inputs.at(-1)!);

    expect(fixture.streamMessage).toHaveBeenCalledOnce();

    await fixture.deliver('message-4', thread, { mention: false, text: 'Also this' });
    await fixture.host.run(fixture.inputs.at(-1)!);

    expect(fixture.streamMessage).toHaveBeenCalledTimes(2);

    await fixture.host.shutdown();
  });

  it('tells a denied author their answering reply was not accepted', async () => {
    const { fixture, hooks } = await askedFixture();

    fixture.access.mockReturnValue(false);

    await fixture.deliver('message-2', thread, { mention: false, text: 'answer' });
    await fixture.host.run(fixture.inputs[1]!);

    expect(hooks.denied).toHaveBeenCalledOnce();
    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.frogbot.create).toHaveBeenCalledOnce();

    await fixture.host.shutdown();
  });
});
