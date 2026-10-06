import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { TurnError } from '../../../../packages/frogbot/src/chat/turn/errors.js';
import type { PendingCall } from '../../../../packages/frogbot/src/chat/turn/types.js';
import { question, type QuestionInput } from '../../../../packages/frogbot/src/tools/question.js';
import { LinearClient } from '../../../../packages/pieces/piece-linear/node_modules/@linear/sdk/dist/index.mjs';
import { LinearChannelAdapter } from '../../../../packages/pieces/piece-linear/src/adapter.js';
import { linearQuestions } from '../../../../packages/pieces/piece-linear/src/questions/index.js';
import { channelFixture } from './helpers.js';
import {
  commentCreated,
  type LinearApi,
  linearRequest,
  sessionCreated,
  sessionPrompted,
  silentLinearLogger,
  startLinearApi,
} from './linearFixtures.js';

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

const secret = 'linear-questions-secret';
const frog = { id: 'user-1', name: 'Frog', email: 'frog@example.com' };
const toad = { id: 'user-2', name: 'Toad', email: 'toad@example.com' };

const color: QuestionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Which color?',
      options: [{ label: 'Red' }, { label: 'Blue' }, { label: 'Green' }],
      custom: true,
    },
  ],
};

let api: LinearApi;
let promptId = 0;

function pendingCall({
  input = color,
  toolCallId = 'call-1',
}: { input?: QuestionInput; toolCallId?: string } = {}): PendingCall {
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

function textTurn(text?: string) {
  return {
    stream: (async function* () {
      if (text) yield text;
    })(),
    persistence: Promise.resolve(),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function linearFixture({ mode = 'agent-sessions' }: { mode?: 'agent-sessions' | 'comments' } = {}) {
  const fixture = channelFixture({
    slug: 'linear',
    adapter: new LinearChannelAdapter({
      accessToken: 'linear-access-token',
      webhookSecret: secret,
      mode,
      userName: 'frogbot',
      apiUrl: api.graphqlUrl,
      logger: silentLinearLogger,
    }),
    client: new LinearClient({ accessToken: 'linear-access-token', apiUrl: api.graphqlUrl }),
    questions: linearQuestions as never,
  });

  Object.assign(fixture.frogbot.agents.support.config, { tools: [question] });
  fixture.identity.mockResolvedValue({ id: 'user-2', collection: 'users' });

  return fixture;
}

type LinearFixture = ReturnType<typeof linearFixture>;

async function webhook(fixture: LinearFixture, payload: object) {
  const before = fixture.inputs.length;
  const response = await fixture.host.webhook('linear', linearRequest({ payload, secret }));

  return { response, inputs: fixture.inputs.slice(before) };
}

async function prompt(
  fixture: LinearFixture,
  {
    body,
    sentAt,
    session = 'session-1',
    signal,
    user = toad,
  }: { body: string; sentAt?: Date; session?: string; signal?: string; user?: typeof toad },
) {
  const activities = api.activities.length;
  const { response, inputs } = await webhook(
    fixture,
    sessionPrompted({ body, id: `prompt-${++promptId}`, sentAt, session, signal, user }),
  );

  expect(response?.status).toBe(200);
  expect(inputs).toHaveLength(1);
  expect(api.activities.length).toBe(activities);

  const queued = fixture.inputs.length;

  await fixture.host.run(clone(inputs[0]));

  return { activities: api.activities.slice(activities), queued: fixture.inputs.slice(queued) };
}

async function asked({ calls = [pendingCall()] }: { calls?: PendingCall[] } = {}) {
  const fixture = linearFixture();

  fixture.streamMessage.mockResolvedValueOnce(textTurn());

  await fixture.host.initialize(false);

  const { inputs } = await webhook(fixture, sessionCreated({ session: 'session-1', user: frog }));

  expect(api.activities).toEqual([]);

  listPendingCalls.mockResolvedValueOnce(calls);

  await fixture.host.run(clone(inputs[0]));

  return fixture;
}

describe('Linear questions through the channel host', () => {
  beforeAll(async () => {
    api = await startLinearApi({ users: [frog, toad] });
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

  it('offers the question tool in a session and posts only the elicitation for a question-only step', async () => {
    const fixture = await asked();

    expect(fixture.streamMessage.mock.calls[0][0].clientTools).toEqual({ kinds: ['question'] });
    expect(api.activities).toEqual([
      {
        id: 'activity-1',
        input: expect.objectContaining({
          agentSessionId: 'session-1',
          content: expect.objectContaining({ type: 'elicitation' }),
          signal: 'select',
        }),
      },
    ]);
    expect(
      fixture.values.get('channels:support:linear:questions:call:chat-1:call-1'),
    ).toMatchObject({
      messages: [{ id: 'activity-1', postedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) }],
      revision: 0,
    });

    await fixture.host.shutdown();
  });

  it('settles a selected option with the Linear responder and continues in the session', async () => {
    const fixture = await asked();

    const { activities, queued } = await prompt(fixture, { body: 'Blue' });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(settleClientToolCall.mock.calls[0][0]).toMatchObject({
      chatId: 'chat-1',
      toolCallId: 'call-1',
      outcome: { output: { answers: [{ header: 'Color', selected: ['Blue'] }] } },
      actor: {
        user: { collection: 'users', id: 'user-2' },
        channel: {
          piece: 'linear',
          account: 'linear',
          id: 'user-2',
          username: 'toad',
          name: 'Toad',
        },
      },
    });
    expect(activities).toEqual([]);
    expect(fixture.streamMessage).toHaveBeenCalledOnce();
    expect(queued).toEqual([
      expect.objectContaining({
        kind: 'continue',
        chatId: 'chat-1',
        responder: expect.objectContaining({ userId: 'user-2' }),
      }),
    ]);

    continueTurn.mockResolvedValueOnce(textTurn('Painting it blue.'));

    await fixture.host.run(clone(queued[0]));

    expect(continueTurn.mock.calls[0][0].clientTools).toEqual({ kinds: ['question'] });
    expect(api.sessionActivities('session-1').at(-1)?.input.content).toEqual({
      type: 'response',
      body: 'Painting it blue.',
    });

    await fixture.host.shutdown();
  });

  it('settles numbered choices on a multi-select question with exact labels', async () => {
    const fixture = await asked({
      calls: [pendingCall({ input: { questions: [{ ...color.questions[0], multiple: true }] } })],
    });

    await prompt(fixture, { body: '3, 1' });

    expect(settleClientToolCall.mock.calls[0][0].outcome).toEqual({
      output: { answers: [{ header: 'Color', selected: ['Red', 'Green'] }] },
    });

    await fixture.host.shutdown();
  });

  it('settles free text as a custom answer', async () => {
    const fixture = await asked();

    await prompt(fixture, { body: 'A deep purple' });

    expect(settleClientToolCall.mock.calls[0][0].outcome).toEqual({
      output: { answers: [{ header: 'Color', selected: [], custom: 'A deep purple' }] },
    });

    await fixture.host.shutdown();
  });

  it('dismisses on a stop request, confirms the stop, and queues no continuation', async () => {
    const fixture = await asked();

    const { activities, queued } = await prompt(fixture, { body: '', signal: 'stop' });

    expect(settleClientToolCall.mock.calls[0][0].outcome).toEqual({ dismissed: true });
    expect(activities.map(({ input }) => input.content)).toEqual([
      { type: 'response', body: 'Stopped. Toad dismissed the question.' },
    ]);
    expect(queued).toEqual([]);

    await fixture.host.shutdown();
  });

  it('answers a reply that lost the race with an already-answered response', async () => {
    const fixture = await asked();

    settleClientToolCall.mockResolvedValueOnce({
      status: 'already-settled',
      part: { state: 'output-available', output: { answers: [] } },
      allSettled: true,
    });

    const { activities, queued } = await prompt(fixture, { body: 'Red' });

    expect(activities.map(({ input }) => input.content)).toEqual([
      { type: 'response', body: 'This question was already answered.' },
    ]);
    expect(queued).toEqual([]);

    await fixture.host.shutdown();
  });

  it('asks again when the tool access check forbids the responder', async () => {
    const fixture = await asked();

    settleClientToolCall.mockRejectedValueOnce(new TurnError('forbidden', 'No.'));

    const { activities, queued } = await prompt(fixture, { body: 'Red' });

    expect(activities).toHaveLength(1);
    expect(activities[0].input).toMatchObject({ signal: 'select' });
    expect(activities[0].input.content.body).toMatch(/^> Toad can't answer this question/);
    expect(queued).toEqual([]);

    await fixture.host.shutdown();
  });

  it('asks again naming a participant who fails agent access, without settling', async () => {
    const fixture = await asked();

    fixture.access.mockReturnValue(false);

    const { activities } = await prompt(fixture, { body: 'Red', user: frog });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(activities[0].input.content.body).toMatch(
      /^> Frog can't answer this question without access to this agent\. It is still open\./,
    );
    expect(fixture.streamMessage).toHaveBeenCalledOnce();

    await fixture.host.shutdown();
  });

  it('asks again with the reason when a typed reply is not allowed, and consumes it', async () => {
    const fixture = await asked({
      calls: [pendingCall({ input: { questions: [{ ...color.questions[0], custom: false }] } })],
    });

    const { activities, queued } = await prompt(fixture, { body: 'Purple' });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.streamMessage).toHaveBeenCalledOnce();
    expect(queued).toEqual([]);
    expect(activities[0].input.content.body).toMatch(
      /^> Reply to “Color” with one of the options\.\n\n\*\*Color\*\*/,
    );

    for (const body of ['maybe', 'later']) {
      const flood = await prompt(fixture, { body });

      expect(flood.activities.map(({ input }) => input.signal)).toEqual(['select']);
      expect(flood.queued).toEqual([]);
    }

    expect(settleClientToolCall).not.toHaveBeenCalled();

    await prompt(fixture, { body: 'Blue' });

    expect(settleClientToolCall.mock.calls[0][0].outcome).toEqual({
      output: { answers: [{ header: 'Color', selected: ['Blue'] }] },
    });

    await fixture.host.shutdown();
  });

  it('does not let a participant without access stop the question', async () => {
    const fixture = await asked();

    fixture.access.mockReturnValue(false);

    const { activities } = await prompt(fixture, { body: '', signal: 'stop', user: frog });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(activities[0].input.content.body).toMatch(/^> Frog can't answer this question/);

    await fixture.host.shutdown();
  });

  it('drops a replayed prompt delivery before it is queued again', async () => {
    const fixture = await asked();
    const payload = sessionPrompted({
      body: 'Red',
      id: 'prompt-replayed',
      session: 'session-1',
      user: toad,
    });

    const first = await webhook(fixture, payload);
    const second = await webhook(fixture, { ...payload, webhookTimestamp: Date.now() });

    expect(first.inputs).toHaveLength(1);
    expect(second.response?.status).toBe(200);
    expect(second.inputs).toEqual([]);

    await fixture.host.shutdown();
  });

  it('rejects an unsigned prompt before anything is queued', async () => {
    const fixture = await asked();

    const response = await fixture.host.webhook(
      'linear',
      new Request('http://localhost/api/webhooks/linear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          sessionPrompted({ body: 'Red', id: 'prompt-unsigned', session: 'session-1', user: toad }),
        ),
      }),
    );

    expect(response?.status).toBeGreaterThanOrEqual(400);
    expect(fixture.inputs).toHaveLength(1);

    await fixture.host.shutdown();
  });

  it('answers a stop request after the answer without stopping or queueing anything', async () => {
    const fixture = await asked();

    await prompt(fixture, { body: 'Blue' });

    const { activities, queued } = await prompt(fixture, { body: '', signal: 'stop' });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(fixture.streamMessage).toHaveBeenCalledOnce();
    expect(queued).toEqual([]);
    expect(activities.map(({ input }) => input.content)).toEqual([
      {
        type: 'response',
        body: 'This question was already answered. A stop request only dismisses an open question.',
      },
    ]);

    await fixture.host.shutdown();
  });

  it('treats a prompt in another session as an ordinary message', async () => {
    const fixture = await asked();

    const { activities } = await prompt(fixture, { body: 'Red', session: 'session-2' });

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.streamMessage).toHaveBeenCalledTimes(2);
    expect(activities.map(({ input }) => [input.agentSessionId, input.content])).toEqual([
      ['session-2', { type: 'response', body: 'Hello back' }],
    ]);

    await fixture.host.shutdown();
  });

  it('passes free text after the answer to the agent, and answers an exact option with stale', async () => {
    const fixture = await asked();

    await prompt(fixture, { body: 'Blue' });

    const followUp = await prompt(fixture, { body: 'Also make it round' });

    expect(fixture.streamMessage).toHaveBeenCalledTimes(2);
    expect(fixture.streamMessage.mock.calls[1][0].messages[0].parts).toEqual([
      { type: 'text', text: 'Also make it round' },
    ]);
    expect(followUp.activities.map(({ input }) => input.content)).toEqual([
      { type: 'response', body: 'Hello back' },
    ]);

    const late = await prompt(fixture, { body: 'Red' });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(fixture.streamMessage).toHaveBeenCalledTimes(2);
    expect(late.activities.map(({ input }) => input.content)).toEqual([
      { type: 'response', body: 'This question was already answered.' },
    ]);

    await fixture.host.shutdown();
  });

  it('asks two questions from one step one at a time and continues once', async () => {
    const size: QuestionInput = {
      questions: [
        {
          header: 'Size',
          question: 'Which size?',
          options: [{ label: 'Small' }, { label: 'Large' }],
          custom: true,
        },
      ],
    };
    const first = pendingCall({ toolCallId: 'call-a' });
    const second = pendingCall({ input: size, toolCallId: 'call-b' });
    const fixture = await asked({ calls: [first, second] });

    expect(api.activities).toHaveLength(1);
    expect(api.activities[0].input.content.body).toContain('**Color**');

    settleClientToolCall.mockResolvedValueOnce({ status: 'settled', part: {}, allSettled: false });
    listPendingCalls.mockResolvedValueOnce([second]);

    const answered = await prompt(fixture, { body: 'Red' });

    expect(settleClientToolCall.mock.calls[0][0].toolCallId).toBe('call-a');
    expect(answered.queued).toEqual([]);
    expect(answered.activities).toHaveLength(1);
    expect(answered.activities[0].input.content.body).toContain('**Size**');
    expect(answered.activities[0].input.signalMetadata?.options).toEqual([
      { label: 'Small', value: 'Small' },
      { label: 'Large', value: 'Large' },
    ]);

    const minuteAgo = new Date(Date.now() - 60_000);
    const early = await prompt(fixture, { body: 'Small', sentAt: minuteAgo });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(early.activities.map(({ input }) => input.content)).toEqual([
      { type: 'response', body: 'This question was already answered.' },
    ]);

    const note = await prompt(fixture, { body: 'Also make it round', sentAt: minuteAgo });

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(fixture.streamMessage).toHaveBeenCalledTimes(2);
    expect(note.activities.map(({ input }) => input.content)).toEqual([
      { type: 'response', body: 'Hello back' },
    ]);

    const last = await prompt(fixture, { body: 'Large' });

    expect(settleClientToolCall.mock.calls[1][0]).toMatchObject({
      toolCallId: 'call-b',
      outcome: { output: { answers: [{ header: 'Size', selected: ['Large'] }] } },
    });
    expect(last.queued).toEqual([expect.objectContaining({ kind: 'continue' })]);

    await fixture.host.shutdown();
  });

  it('withholds the question tool in comments mode and posts no agent activity', async () => {
    const fixture = linearFixture({ mode: 'comments' });

    fixture.streamMessage.mockResolvedValueOnce(textTurn());

    await fixture.host.initialize(false);

    const { inputs } = await webhook(
      fixture,
      commentCreated({ body: '@frogbot pick a color', id: 'comment-9', user: frog }),
    );

    await fixture.host.run(clone(inputs[0]));

    expect(inputs[0].thread.id).toBe('linear:issue-1:c:comment-9');
    expect(fixture.streamMessage.mock.calls[0][0].clientTools).toEqual({ kinds: [] });
    expect(api.activities).toEqual([]);

    await fixture.host.shutdown();
  });
});
