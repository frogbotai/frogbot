import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { TurnError } from '../../../../packages/frogbot/src/chat/turn/errors.js';
import type { PendingCall } from '../../../../packages/frogbot/src/chat/turn/types.js';
import { question, type QuestionInput } from '../../../../packages/frogbot/src/tools/question.js';
import { FrogBotTeamsAdapter } from '../../../../packages/pieces/piece-microsoft-teams/src/adapter.js';
import { teamsQuestions } from '../../../../packages/pieces/piece-microsoft-teams/src/questions/index.js';
import { channelFixture } from './helpers.js';
import {
  botAppId,
  botAppPassword,
  cardInputs,
  cardOf,
  members,
  mentionActivity,
  startTeamsServer,
  submitActivity,
  teamsActivity,
  type TeamsScope,
  type TeamsServer,
  textRuns,
} from './teamsFixtures.js';

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

const colorQuestion: QuestionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color should the fence be?',
      options: [
        { label: 'Red, barn', description: 'Classic' },
        { label: 'Blue' },
        { label: 'White' },
      ],
      custom: true,
    },
  ],
};

let server: TeamsServer;

function pendingCall(toolCallId = 'call-1', input: QuestionInput = colorQuestion): PendingCall {
  return {
    toolCallId,
    toolName: 'question',
    input,
    messageId: 'assistant-1',
    chatId: 'chat-1',
    agentSlug: 'support',
    createdAt: '2026-09-25T00:00:00.000Z',
  };
}

async function teamsFixture() {
  const fixture = channelFixture({
    slug: 'teams',
    adapter: new FrogBotTeamsAdapter({
      appId: botAppId,
      appPassword: botAppPassword,
      apiUrl: server.url,
      userName: 'FrogBot',
    }),
    questions: teamsQuestions as never,
  });

  Object.assign(fixture.frogbot.agents.support.config, { tools: [question] });
  Object.assign(fixture.frogbot.logger, { warn: vi.fn() });
  fixture.identity.mockImplementation((async ({ author }: { author: { email?: string } }) =>
    author.email ? { id: `user:${author.email}`, collection: 'users' } : null) as never);
  fixture.access.mockImplementation((({ req }: { req: { user: unknown } }) =>
    Boolean(req.user)) as never);

  await fixture.host.initialize(false);

  return fixture;
}

async function askedFixture({
  call = pendingCall(),
  scope = 'channel',
}: { call?: PendingCall; scope?: TeamsScope } = {}) {
  const fixture = await teamsFixture();

  await fixture.host.webhook(
    'teams',
    server.signed(mentionActivity({ id: '1000', scope, serviceUrl: server.serviceUrl })),
  );

  listPendingCalls.mockResolvedValueOnce([call]);

  await fixture.host.run(JSON.parse(JSON.stringify(fixture.inputs[0])));

  const cardId = server.cards().at(-1)!.sentId!;

  server.reset();

  return { ...fixture, cardId };
}

async function click(
  fixture: Awaited<ReturnType<typeof teamsFixture>>,
  options: Parameters<typeof submitActivity>[0],
) {
  return fixture.host.webhook('teams', server.signed(submitActivity(options)));
}

describe('Teams native questions through the channel host', () => {
  beforeAll(async () => {
    server = await startTeamsServer();
  });

  beforeEach(() => {
    server.reset();
    server.interceptLogin();
    listPendingCalls.mockReset().mockResolvedValue([]);
    settleClientToolCall.mockReset().mockResolvedValue({
      status: 'settled',
      part: {},
      allSettled: true,
    });
    continueTurn.mockReset();
  });

  afterEach(() => {
    server.assertExpected();

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await server.close();
  });

  it('posts one Adaptive Card with every label in the Teams thread', async () => {
    const fixture = await teamsFixture();

    await fixture.host.webhook(
      'teams',
      server.signed(mentionActivity({ id: '1000', serviceUrl: server.serviceUrl })),
    );

    listPendingCalls.mockResolvedValueOnce([pendingCall()]);

    await fixture.host.run(JSON.parse(JSON.stringify(fixture.inputs[0])));

    const [card] = server.cards();

    expect(card).toMatchObject({ conversationId: '19:general@thread.tacv2;messageid=1000' });
    expect(cardOf(card)).toMatchObject({ type: 'AdaptiveCard', version: '1.5' });
    expect(cardInputs(card)[0]!.choices).toEqual([
      { title: 'Red, barn — Classic', value: '0' },
      { title: 'Blue', value: '1' },
      { title: 'White', value: '2' },
    ]);
    expect(server.texts()).toEqual(['Hello back']);

    await fixture.host.shutdown();
  });

  it('settles a teammate’s submission with their email-linked account and continues', async () => {
    const fixture = await askedFixture();
    const { cardId } = fixture;

    const response = await click(fixture, {
      card: cardId,
      from: members.grace,
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
      values: { 'question-0': '0' },
    });

    expect(response?.status).toBe(200);
    expect(fixture.identity).toHaveBeenLastCalledWith(
      expect.objectContaining({ author: expect.objectContaining({ email: 'grace@example.com' }) }),
    );
    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(settleClientToolCall.mock.calls[0]![0]).toMatchObject({
      outcome: { output: { answers: [{ header: 'Color', selected: ['Red, barn'] }] } },
      actor: {
        user: { id: 'user:grace@example.com', collection: 'users' },
        channel: {
          piece: 'teams',
          account: 'teams',
          id: '29:grace',
          username: 'Grace Hopper',
          name: 'Grace Hopper',
        },
      },
    });

    const [update] = server.updates();

    expect(update).toMatchObject({ activityId: cardId });
    expect(cardInputs(update)).toEqual([]);
    expect(JSON.stringify(cardOf(update))).toContain('Answered by Grace Hopper');
    expect(fixture.inputs.at(-1)).toMatchObject({
      kind: 'continue',
      responder: { userId: '29:grace', email: 'grace@example.com' },
    });

    await fixture.host.shutdown();
  });

  it('answers a late click with the settled card and a private notice', async () => {
    const fixture = await askedFixture();
    const { cardId } = fixture;

    await click(fixture, {
      card: cardId,
      from: members.grace,
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
      values: { 'question-0': '1' },
    });

    server.reset();

    await click(fixture, {
      card: cardId,
      from: members.ada,
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
      values: { 'question-0': '2' },
    });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(JSON.stringify(cardOf(server.updates()[0]))).toContain('Answered by Grace Hopper');
    expect(server.targeted()).toMatchObject([
      { body: { text: 'This question was already answered.', recipient: { id: '29:ada' } } },
    ]);
    expect(fixture.inputs.filter(({ kind }) => kind === 'continue')).toHaveLength(1);

    await fixture.host.shutdown();
  });

  it('denies an unmatched responder privately and leaves the card open', async () => {
    const fixture = await askedFixture();
    const { cardId } = fixture;

    await click(fixture, {
      card: cardId,
      from: members.guest,
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
      values: { 'question-0': '0' },
    });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(server.updates()).toEqual([]);
    expect(server.targeted()).toMatchObject([
      {
        body: {
          text: "FrogBot couldn't match your Teams account to a user, so you can't answer this question.",
          recipient: { id: '29:guest' },
        },
      },
    ]);

    await fixture.host.shutdown();
  });

  it('settles a submission that arrives without replyToId', async () => {
    const fixture = await askedFixture();

    await click(fixture, {
      from: members.grace,
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
      values: { 'question-0': '1' },
    });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(server.updates()).toHaveLength(1);

    await fixture.host.shutdown();
  });

  it('ignores a submission naming the call from another conversation', async () => {
    const fixture = await askedFixture();
    const { cardId } = fixture;

    await click(fixture, {
      card: cardId,
      from: members.grace,
      scope: 'groupChat',
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
      values: { 'question-0': '1' },
    });

    await click(fixture, {
      from: members.grace,
      scope: 'groupChat',
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
      values: { 'question-0': '1' },
    });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(server.requests.filter(({ method }) => method !== 'GET')).toEqual([]);

    await fixture.host.shutdown();
  });

  it('redraws the card with the reason when a submission is incomplete', async () => {
    const fixture = await askedFixture();
    const { cardId } = fixture;

    await click(fixture, {
      card: cardId,
      from: members.grace,
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
      values: { 'question-0-text': '  ' },
    });

    const [update] = server.updates();

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(update).toMatchObject({ activityId: cardId });
    expect(textRuns(cardOf(update)!.body).at(-1)).toMatchObject({
      text: 'Answer “Color” before submitting.',
      color: 'Attention',
    });

    await fixture.host.shutdown();
  });

  it('dismisses, shows who dismissed, and stops the turn', async () => {
    const fixture = await askedFixture();
    const { cardId } = fixture;

    await click(fixture, {
      action: 'dismiss',
      card: cardId,
      from: members.grace,
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
    });

    expect(settleClientToolCall.mock.calls[0]![0].outcome).toEqual({ dismissed: true });
    expect(JSON.stringify(cardOf(server.updates()[0]))).toContain('Dismissed by Grace Hopper');
    expect(fixture.inputs.filter(({ kind }) => kind === 'continue')).toEqual([]);

    await fixture.host.shutdown();
  });

  it('closes the card when the turn is no longer waiting for the answer', async () => {
    const fixture = await askedFixture();
    const { cardId } = fixture;

    settleClientToolCall.mockRejectedValueOnce(new TurnError('not-awaiting', 'Not waiting.'));

    await click(fixture, {
      card: cardId,
      from: members.grace,
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
      values: { 'question-0': '0' },
    });

    const [update] = server.updates();

    expect(update).toMatchObject({ activityId: cardId });
    expect(cardInputs(update)).toEqual([]);
    expect(server.targeted()).toMatchObject([
      { body: { text: 'This question is no longer open.', recipient: { id: '29:grace' } } },
    ]);
    expect(fixture.inputs.filter(({ kind }) => kind === 'continue')).toEqual([]);

    await fixture.host.shutdown();
  });

  it('posts a dismiss-only card for a question too large for Teams and lets it be dismissed', async () => {
    const options = Array.from({ length: 2000 }, (_, index) => ({ label: `Option ${index}` }));
    const fixture = await askedFixture({
      call: pendingCall('call-1', {
        questions: [{ header: 'Pick', question: 'Which?', options, custom: false }],
      }),
    });

    expect((fixture.frogbot.logger as unknown as { warn: () => void }).warn).toHaveBeenCalledOnce();

    await click(fixture, {
      action: 'dismiss',
      card: fixture.cardId,
      from: members.grace,
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
    });

    expect(settleClientToolCall.mock.calls[0]![0].outcome).toEqual({ dismissed: true });
    expect(JSON.stringify(cardOf(server.updates()[0]))).toContain('Dismissed by Grace Hopper');

    await fixture.host.shutdown();
  });

  it('ignores an adaptive card invoke that carries the question action id', async () => {
    const fixture = await askedFixture();
    const { cardId } = fixture;

    const response = await fixture.host.webhook(
      'teams',
      server.signed(
        teamsActivity({
          type: 'invoke',
          name: 'adaptiveCard/action',
          id: 'invoke-1',
          from: members.grace,
          replyToId: cardId,
          serviceUrl: server.serviceUrl,
          value: {
            action: {
              type: 'Action.Execute',
              data: { actionId: 'frogbot.question.submit', value: 'call-1', 'question-0': '0' },
            },
          },
        }),
      ),
    );

    expect(response?.status).toBe(200);
    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(server.requests.filter(({ method }) => method !== 'GET')).toEqual([]);

    await fixture.host.shutdown();
  });

  it.each<TeamsScope>(['channel', 'groupChat', 'personal'])(
    'offers the question tool in a %s conversation',
    async (scope) => {
      const fixture = await teamsFixture();

      await fixture.host.webhook(
        'teams',
        server.signed(mentionActivity({ id: '1000', scope, serviceUrl: server.serviceUrl })),
      );
      await fixture.host.run(JSON.parse(JSON.stringify(fixture.inputs[0])));

      expect(fixture.streamMessage.mock.calls[0]![0].clientTools).toEqual({ kinds: ['question'] });

      await fixture.host.shutdown();
    },
  );
});
