import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrogBotTeamsAdapter } from '../../../packages/pieces/piece-microsoft-teams/src/adapter.js';
import { questionCard } from '../../../packages/pieces/piece-microsoft-teams/src/questions/card.js';
import {
  botAppId,
  botAppPassword,
  members,
  memoryState,
  mentionActivity,
  startTeamsServer,
  submitActivity,
  type TeamsServer,
} from '../frogbot/channels/teamsFixtures.js';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

const call = {
  toolCallId: 'call-1',
  toolName: 'question',
  messageId: 'assistant-1',
  chatId: 'chat-1',
  agentSlug: 'support',
  createdAt: '2026-09-25T00:00:00.000Z',
  input: {
    questions: [
      { header: 'Color', question: 'Which color?', options: [{ label: 'Red' }], custom: true },
    ],
  },
};

let server: TeamsServer;

async function initialized() {
  const state = memoryState();
  const chat = {
    getState: () => state,
    processAction: vi.fn(),
    processMessage: vi.fn(),
    getLogger: () => undefined,
  };

  const adapter = new FrogBotTeamsAdapter({
    appId: botAppId,
    appPassword: botAppPassword,
    apiUrl: server.url,
    userName: 'FrogBot',
  });

  await adapter.initialize(chat as never);

  return { adapter, chat, state };
}

async function dispatched(adapter: FrogBotTeamsAdapter, activity: Record<string, unknown>) {
  const pending: Promise<unknown>[] = [];

  const response = await adapter.handleWebhook(server.signed(activity), {
    waitUntil: (task) => pending.push(task),
  });

  await Promise.all(pending);

  return response;
}

function threadIdOf(adapter: FrogBotTeamsAdapter, activity: Record<string, unknown>) {
  return adapter.parseMessage(activity).threadId;
}

describe('FrogBot Teams adapter', () => {
  beforeAll(async () => {
    server = await startTeamsServer();
  });

  beforeEach(() => {
    server.reset();
    server.interceptLogin();
  });

  afterEach(() => {
    server.assertExpected();

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await server.close();
  });

  it('sends an Adaptive Card to the thread conversation and returns its activity id', async () => {
    const { adapter } = await initialized();
    const activity = mentionActivity({ id: '1000', serviceUrl: server.serviceUrl });
    const card = questionCard({ call });

    const id = await adapter.sendAdaptiveCard({ threadId: threadIdOf(adapter, activity), card });

    expect(id).toMatch(/^\d+$/);
    expect(server.cards()).toMatchObject([
      {
        conversationId: '19:general@thread.tacv2;messageid=1000',
        body: {
          type: 'message',
          attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: card }],
        },
      },
    ]);
  });

  it('replaces a card in place', async () => {
    const { adapter } = await initialized();
    const activity = mentionActivity({ id: '1000', serviceUrl: server.serviceUrl });
    const card = questionCard({ call, error: 'Answer “Color” before submitting.' });

    await adapter.updateAdaptiveCard({
      threadId: threadIdOf(adapter, activity),
      messageId: '1700000000123',
      card,
    });

    expect(server.updates()).toMatchObject([
      {
        conversationId: '19:general@thread.tacv2;messageid=1000',
        activityId: '1700000000123',
        body: { attachments: [{ content: card }] },
      },
    ]);
  });

  it('dispatches a question action with the responder email from the roster', async () => {
    const { adapter, chat } = await initialized();
    const activity = submitActivity({
      card: '1700000000001',
      from: members.grace,
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
      values: { 'question-0': '0' },
    });

    const response = await dispatched(adapter, activity);

    expect(response.status).toBe(200);
    expect(server.requests).toMatchObject([
      {
        method: 'GET',
        path: '/v3/conversations/19:general@thread.tacv2;messageid=1000/members/29:grace',
      },
    ]);
    expect(chat.processAction).toHaveBeenCalledOnce();
    expect(chat.processAction.mock.calls[0]![0]).toMatchObject({
      actionId: 'frogbot.question.submit',
      value: 'call-1',
      messageId: '1700000000001',
      threadId: threadIdOf(adapter, activity),
      adapter,
      raw: { value: { 'question-0': '0' } },
      user: {
        userId: '29:grace',
        userName: 'Grace Hopper',
        fullName: 'Grace Hopper',
        email: 'grace@example.com',
        isBot: false,
        isMe: false,
      },
    });
  });

  it('falls back to the adapter user lookup when the roster call fails', async () => {
    const { adapter, chat, state } = await initialized();

    state.values.set(
      'teams:userInfo:aad-grace',
      JSON.stringify({ email: 'grace@cache.example', fullName: 'Grace H', userName: 'grace' }),
    );
    state.values.set('teams:aadObjectId:29:grace', 'aad-grace');
    server.fail('GET', 500);

    await dispatched(
      adapter,
      submitActivity({
        card: '1700000000001',
        from: members.grace,
        serviceUrl: server.serviceUrl,
        toolCallId: 'call-1',
      }),
    );

    expect(chat.processAction.mock.calls[0]![0].user).toMatchObject({
      userId: '29:grace',
      email: 'grace@cache.example',
      fullName: 'Grace Hopper',
    });
  });

  it('dispatches without an email when no lookup can resolve the responder', async () => {
    const { adapter, chat } = await initialized();

    await dispatched(
      adapter,
      submitActivity({
        card: '1700000000001',
        from: members.guest,
        serviceUrl: server.serviceUrl,
        toolCallId: 'call-1',
      }),
    );

    const { user } = chat.processAction.mock.calls[0]![0];

    expect(user).toMatchObject({ userId: '29:guest', fullName: 'Guest' });
    expect(user).not.toHaveProperty('email');
  });

  it('locates the card from its record when Teams omits replyToId', async () => {
    const { adapter, chat } = await initialized();
    const activity = submitActivity({ serviceUrl: server.serviceUrl, toolCallId: 'call-1' });

    await adapter.saveQuestionRecord({
      threadId: threadIdOf(adapter, activity),
      toolCallId: 'call-1',
      record: { messageId: '1700000000042' },
    });

    await dispatched(adapter, activity);

    expect(chat.processAction.mock.calls[0]![0].messageId).toBe('1700000000042');
  });

  it('keeps the submit activity id when the record belongs to another conversation', async () => {
    const { adapter, chat } = await initialized();
    const elsewhere = submitActivity({
      scope: 'groupChat',
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
    });

    await adapter.saveQuestionRecord({
      threadId: threadIdOf(adapter, elsewhere),
      toolCallId: 'call-1',
      record: { messageId: '1700000000042' },
    });

    const activity = submitActivity({
      id: 'submit-own',
      serviceUrl: server.serviceUrl,
      toolCallId: 'call-1',
    });

    await dispatched(adapter, activity);

    expect(chat.processAction.mock.calls[0]![0].messageId).toBe('submit-own');
  });

  it('leaves other card actions to the Teams adapter', async () => {
    const { adapter, chat } = await initialized();

    await dispatched(adapter, {
      ...submitActivity({ card: '1700000000001', serviceUrl: server.serviceUrl, toolCallId: 'x' }),
      value: { actionId: 'approve', value: 'yes' },
    });

    expect(server.requests).toEqual([]);
    expect(chat.processAction.mock.calls[0]![0]).toMatchObject({
      actionId: 'approve',
      value: 'yes',
      user: { userId: '29:ada' },
    });
    expect(chat.processAction.mock.calls[0]![0].user).not.toHaveProperty('email');
  });

  it('rejects an activity whose token was issued for another bot', async () => {
    const { adapter, chat } = await initialized();

    const response = await adapter.handleWebhook(
      server.signed(
        submitActivity({ card: '1', serviceUrl: server.serviceUrl, toolCallId: 'call-1' }),
        { audience: 'another-bot' },
      ),
    );

    expect(response.status).toBe(401);
    expect(chat.processAction).not.toHaveBeenCalled();
  });
});
