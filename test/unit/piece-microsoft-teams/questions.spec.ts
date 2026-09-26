import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ChannelQuestionCall,
  QuestionInteraction,
} from '../../../packages/frogbot/src/channels/questions/types.js';
import type { QuestionInput } from '../../../packages/frogbot/src/tools/question.js';
import { FrogBotTeamsAdapter } from '../../../packages/pieces/piece-microsoft-teams/src/adapter.js';
import { TeamsQuestionCardTooLarge } from '../../../packages/pieces/piece-microsoft-teams/src/questions/card.js';
import { teamsQuestions } from '../../../packages/pieces/piece-microsoft-teams/src/questions/index.js';
import {
  botAppId,
  botAppPassword,
  cardInputs,
  cardOf,
  members,
  memoryState,
  mentionActivity,
  startTeamsServer,
  type TeamsMember,
  type TeamsServer,
  textRuns,
} from '../frogbot/channels/teamsFixtures.js';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

type Item = QuestionInput['questions'][number];

const { parse } = teamsQuestions;

let server: TeamsServer;

function questionCall(toolCallId: string, ...questions: Array<Partial<Item>>): ChannelQuestionCall {
  return {
    toolCallId,
    toolName: 'question',
    messageId: 'assistant-1',
    chatId: 'chat-1',
    agentSlug: 'support',
    createdAt: '2026-09-25T00:00:00.000Z',
    input: {
      questions: (questions.length ? questions : [{}]).map((item, index) => ({
        header: `Q${index + 1}`,
        question: `Question ${index + 1}?`,
        options: [{ label: 'Red' }, { label: 'Blue' }, { label: 'Green' }],
        custom: true,
        ...item,
      })),
    },
  };
}

function action({
  actionId = 'frogbot.question.submit',
  email,
  from = members.grace,
  raw,
  toolCallId = 'call-1',
  values = {},
}: {
  actionId?: string;
  email?: string;
  from?: TeamsMember;
  raw?: Record<string, unknown>;
  toolCallId?: string;
  values?: Record<string, unknown>;
} = {}): QuestionInteraction {
  return {
    type: 'action',
    event: {
      actionId,
      value: toolCallId,
      messageId: 'card-1',
      threadId: 'teams:thread',
      triggerId: undefined,
      user: {
        userId: from.id,
        userName: from.name,
        fullName: from.name,
        ...(email ? { email } : {}),
        isBot: false,
        isMe: false,
      },
      adapter: {} as never,
      thread: null,
      openModal: vi.fn(),
      raw: raw ?? { type: 'message', value: { actionId, value: toolCallId, ...values } },
    },
  };
}

function submit(call: ChannelQuestionCall, values: Record<string, unknown>) {
  return parse({
    call,
    interaction: action({ values, toolCallId: call.toolCallId }),
    settled: false,
  });
}

async function teamsThread() {
  const state = memoryState();
  const adapter = new FrogBotTeamsAdapter({
    appId: botAppId,
    appPassword: botAppPassword,
    apiUrl: server.url,
  });

  await adapter.initialize({ getState: () => state, processAction: vi.fn() } as never);

  const id = adapter.parseMessage(
    mentionActivity({ id: '1000', serviceUrl: server.serviceUrl }),
  ).threadId;

  return { adapter, state, thread: { id, adapter } as never };
}

function hookArgs(thread: never, call: ChannelQuestionCall) {
  return { call, client: {} as never, messageId: '1700000000001', req: {} as never, thread };
}

describe('Teams question hooks', () => {
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

  describe('parse', () => {
    it('maps a single choice index back to its label', () => {
      expect(submit(questionCall('call-1'), { 'question-0': '2' })).toEqual({
        kind: 'answer',
        output: { answers: [{ header: 'Q1', selected: ['Green'] }] },
      });
    });

    it('maps a multi-select value to labels in option order', () => {
      const call = questionCall('call-1', { multiple: true });

      expect(submit(call, { 'question-0': '2,0' })).toEqual({
        kind: 'answer',
        output: { answers: [{ header: 'Q1', selected: ['Red', 'Green'] }] },
      });
    });

    it('keeps labels that contain commas intact', () => {
      const call = questionCall('call-1', {
        multiple: true,
        options: [{ label: 'Red, dark' }, { label: 'Blue, light' }, { label: 'Plain' }],
      });

      expect(submit(call, { 'question-0': '0,1' })).toMatchObject({
        output: { answers: [{ selected: ['Red, dark', 'Blue, light'] }] },
      });
    });

    it('maps every index of a large option set back to the exact label', () => {
      const options = Array.from({ length: 400 }, (_, index) => ({ label: `Option ${index}` }));
      const call = questionCall('call-1', { multiple: true, options });

      expect(submit(call, { 'question-0': '399,0,200,200' })).toMatchObject({
        output: { answers: [{ selected: ['Option 0', 'Option 200', 'Option 399'] }] },
      });
    });

    it('accepts a typed answer alone, trimmed', () => {
      expect(submit(questionCall('call-1'), { 'question-0-text': '  Teal  ' })).toEqual({
        kind: 'answer',
        output: { answers: [{ header: 'Q1', selected: [], custom: 'Teal' }] },
      });
    });

    it('lets a typed answer replace a single choice', () => {
      expect(
        submit(questionCall('call-1'), { 'question-0': '1', 'question-0-text': 'Teal' }),
      ).toMatchObject({ output: { answers: [{ selected: [], custom: 'Teal' }] } });
    });

    it('keeps both choices and a typed answer on a multi-select question', () => {
      const call = questionCall('call-1', { multiple: true });

      expect(submit(call, { 'question-0': '0', 'question-0-text': 'Teal' })).toMatchObject({
        output: { answers: [{ selected: ['Red'], custom: 'Teal' }] },
      });
    });

    it('ignores typed text on a question that does not allow it', () => {
      const call = questionCall('call-1', { custom: false });

      expect(submit(call, { 'question-0': '0', 'question-0-text': 'Teal' })).toEqual({
        kind: 'answer',
        output: { answers: [{ header: 'Q1', selected: ['Red'] }] },
      });
    });

    it('answers several questions from one submission', () => {
      const call = questionCall(
        'call-1',
        { header: 'Colors', multiple: true, custom: false },
        { header: 'Size', options: [{ label: 'S' }, { label: 'L' }] },
      );

      expect(submit(call, { 'question-0': '0,1', 'question-1-text': 'XL' })).toEqual({
        kind: 'answer',
        output: {
          answers: [
            { header: 'Colors', selected: ['Red', 'Blue'] },
            { header: 'Size', selected: [], custom: 'XL' },
          ],
        },
      });
    });

    it.each([
      [{}, 'Answer “Q1” before submitting.'],
      [{ 'question-0-text': '   ' }, 'Answer “Q1” before submitting.'],
      [{ 'question-0': '  ' }, 'Answer “Q1” before submitting.'],
      [
        { 'question-0': '99999999999999999999' },
        '“Q1” has an answer that was not offered. Choose again.',
      ],
      [{ 'question-0': '7' }, '“Q1” has an answer that was not offered. Choose again.'],
      [{ 'question-0': 'red' }, '“Q1” has an answer that was not offered. Choose again.'],
      [{ 'question-0': ['0'] }, '“Q1” has an answer that was not offered. Choose again.'],
      [{ 'question-0': '0,1' }, 'Choose one answer for “Q1”.'],
    ])('rejects %j', (values, reason) => {
      expect(submit(questionCall('call-1'), values)).toEqual({ kind: 'rejected', reason });
    });

    it('treats a repeated single choice as one answer', () => {
      expect(submit(questionCall('call-1', { custom: false }), { 'question-0': '0,0' })).toEqual({
        kind: 'answer',
        output: { answers: [{ header: 'Q1', selected: ['Red'] }] },
      });
    });

    it('names the first unanswered question', () => {
      const call = questionCall('call-1', { header: 'Color' }, { header: 'Size' });

      expect(submit(call, { 'question-0': '0' })).toEqual({
        kind: 'rejected',
        reason: 'Answer “Size” before submitting.',
      });
    });

    it('dismisses without reading inputs', () => {
      expect(
        parse({
          call: questionCall('call-1'),
          interaction: action({ actionId: 'frogbot.question.dismiss' }),
          settled: false,
        }),
      ).toEqual({ kind: 'dismiss' });
    });

    it('still recognizes its own card after settlement so late clicks are stale', () => {
      expect(
        parse({
          call: questionCall('call-1'),
          interaction: action({ values: { 'question-0': '0' } }),
          settled: true,
        }).kind,
      ).toBe('answer');
    });

    it.each([
      ['another call', action({ toolCallId: 'call-2', values: { 'question-0': '0' } })],
      ['an unknown action', action({ actionId: 'frogbot.question.other' })],
      [
        'an auto-submit fan-out that names the question action',
        action({
          raw: {
            type: 'message',
            value: {
              actionId: '__auto_submit',
              'frogbot.question.submit': 'call-1',
              'question-0': '0',
            },
          },
        }),
      ],
      [
        'an invoke carrying the action id',
        action({
          raw: {
            type: 'invoke',
            name: 'adaptiveCard/action',
            value: { action: { data: { actionId: 'frogbot.question.submit', value: 'call-1' } } },
          },
        }),
      ],
      [
        'a thread reply',
        { type: 'message', message: { text: 'Red', author: { userId: '29:grace' } } },
      ],
      ['a form submission', { type: 'modalSubmit', event: { values: {}, raw: {} } }],
    ])('ignores %s', (_, interaction) => {
      expect(
        parse({ call: questionCall('call-1'), interaction: interaction as never, settled: false }),
      ).toEqual({ kind: 'ignore' });
    });
  });

  describe('render', () => {
    it('posts the first call as one card and records its message', async () => {
      const { adapter, thread } = await teamsThread();

      const rendered = await teamsQuestions.render({
        calls: [questionCall('call-1'), questionCall('call-2')],
        client: {} as never,
        req: {} as never,
        thread,
      });

      expect(server.cards()).toHaveLength(1);
      expect(cardOf(server.cards()[0])!.actions![0]!.data).toEqual({
        actionId: 'frogbot.question.submit',
        value: 'call-1',
      });
      expect(rendered).toEqual([{ messageId: expect.stringMatching(/^\d+$/), calls: ['call-1'] }]);
      expect(
        await adapter.findQuestionRecord({
          threadId: (thread as { id: string }).id,
          toolCallId: 'call-1',
        }),
      ).toEqual({ messageId: rendered[0]!.messageId });
    });

    it('renders nothing without calls', async () => {
      const { thread } = await teamsThread();

      expect(
        await teamsQuestions.render({ calls: [], client: {} as never, req: {} as never, thread }),
      ).toEqual([]);
      expect(server.requests).toEqual([]);
    });

    it('posts a dismiss-only card when the question cannot fit', async () => {
      const { thread } = await teamsThread();
      const logger = { warn: vi.fn() };
      const options = Array.from({ length: 2000 }, (_, index) => ({ label: `Option ${index}` }));

      const rendered = await teamsQuestions.render({
        calls: [questionCall('call-1', { options })],
        client: {} as never,
        req: { frogbot: { logger } } as never,
        thread,
      });

      const card = cardOf(server.cards()[0]);

      expect(rendered).toEqual([{ messageId: server.cards()[0]!.sentId, calls: ['call-1'] }]);
      expect(cardInputs(server.cards()[0])).toEqual([]);
      expect(card!.actions).toEqual([
        expect.objectContaining({
          title: 'Dismiss',
          data: { actionId: 'frogbot.question.dismiss', value: 'call-1' },
        }),
      ]);
      expect(textRuns(card!.body).at(-1)).toMatchObject({
        text: 'This question is too large to show in Teams. Answer it in FrogBot, or dismiss it here.',
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(TeamsQuestionCardTooLarge) }),
        expect.any(String),
      );
    });

    it('keeps the posted card when its record cannot be saved', async () => {
      const { state, thread } = await teamsThread();

      state.set.mockRejectedValueOnce(new Error('KV unavailable'));

      const rendered = await teamsQuestions.render({
        calls: [questionCall('call-1')],
        client: {} as never,
        req: {} as never,
        thread,
      });

      expect(server.cards()).toHaveLength(1);
      expect(rendered).toEqual([{ messageId: server.cards()[0]!.sentId, calls: ['call-1'] }]);
    });

    it('requires the FrogBot Teams adapter', async () => {
      await expect(
        teamsQuestions.render({
          calls: [questionCall('call-1')],
          client: {} as never,
          req: {} as never,
          thread: { id: 'teams:x:y', adapter: { name: 'teams' } } as never,
        }),
      ).rejects.toThrow('Microsoft Teams questions require the FrogBot Teams adapter.');
    });
  });

  describe('settled', () => {
    it('replaces the card with the answers and the responder and records the view', async () => {
      const { adapter, thread } = await teamsThread();
      const call = questionCall('call-1');
      const outcome = { output: { answers: [{ header: 'Q1', selected: ['Blue'] }] } };

      await teamsQuestions.settled({
        ...hookArgs(thread, call),
        actor: {
          user: null,
          channel: { piece: 'microsoft-teams', id: '29:grace', name: 'Grace Hopper' },
        },
        outcome,
      });

      const [update] = server.updates();

      expect(update).toMatchObject({ activityId: '1700000000001' });
      expect(cardInputs(update)).toEqual([]);
      expect(cardOf(update)).not.toHaveProperty('actions');
      expect(JSON.stringify(cardOf(update))).toContain('✅ Blue');
      expect(JSON.stringify(cardOf(update))).toContain('Answered by Grace Hopper');
      expect(
        await adapter.findQuestionRecord({
          threadId: (thread as { id: string }).id,
          toolCallId: 'call-1',
        }),
      ).toEqual({ messageId: '1700000000001', settled: { outcome, by: 'Grace Hopper' } });
    });

    it('shows a stored answer without a responder when it was answered elsewhere', async () => {
      const { thread } = await teamsThread();

      await teamsQuestions.settled({
        ...hookArgs(thread, questionCall('call-1')),
        actor: null,
        outcome: { dismissed: true },
      });

      expect(textRuns(cardOf(server.updates()[0])!.body).at(-1)).toMatchObject({
        text: 'Dismissed',
      });
    });
  });

  describe('rejected', () => {
    it('redraws the card with the reason and the submitted values', async () => {
      const { thread } = await teamsThread();
      const call = questionCall('call-1', { header: 'Color' }, { header: 'Size', multiple: true });

      await teamsQuestions.rejected!({
        ...hookArgs(thread, call),
        interaction: action({ values: { 'question-0': '1', 'question-1-text': 'XL', extra: 'x' } }),
        reason: 'Answer “Size” before submitting.',
      });

      const [update] = server.updates();

      expect(cardInputs(update).map(({ id, value }) => [id, value])).toEqual([
        ['question-0', '1'],
        ['question-0-text', undefined],
        ['question-1', undefined],
        ['question-1-text', 'XL'],
      ]);
      expect(textRuns(cardOf(update)!.body).at(-1)).toMatchObject({
        text: 'Answer “Size” before submitting.',
        color: 'Attention',
      });
      expect(cardOf(update)!.actions).toHaveLength(2);
    });

    it('tells the responder privately when the card cannot be redrawn', async () => {
      const { thread } = await teamsThread();
      const options = Array.from({ length: 2000 }, (_, index) => ({ label: `Option ${index}` }));

      await teamsQuestions.rejected!({
        ...hookArgs(thread, questionCall('call-1', { options })),
        interaction: action({ values: { 'question-0': '1' } }),
        reason: 'Answer “Q1” before submitting.',
      });

      expect(server.updates()).toEqual([]);
      expect(server.targeted()).toMatchObject([
        { body: { text: 'Answer “Q1” before submitting.', recipient: { id: '29:grace' } } },
      ]);
    });
  });

  describe('denied', () => {
    it('tells an unauthorized responder privately', async () => {
      const { thread } = await teamsThread();

      await teamsQuestions.denied!({
        ...hookArgs(thread, questionCall('call-1')),
        interaction: action({ email: 'mallory@elsewhere.example', from: members.mallory }),
      });

      expect(server.targeted()).toMatchObject([
        {
          body: {
            text: "You don't have access to answer this question.",
            recipient: { id: '29:mallory' },
          },
        },
      ]);
      expect(server.updates()).toEqual([]);
    });

    it('explains when the Teams account could not be matched', async () => {
      const { thread } = await teamsThread();

      await teamsQuestions.denied!({
        ...hookArgs(thread, questionCall('call-1')),
        interaction: action({ from: members.guest }),
      });

      expect(server.targeted()[0]!.body.text).toBe(
        "FrogBot couldn't match your Teams account to a user, so you can't answer this question.",
      );
    });
  });

  describe('stale', () => {
    it('restores the settled card and tells the late responder', async () => {
      const { thread } = await teamsThread();
      const call = questionCall('call-1');

      await teamsQuestions.settled({
        ...hookArgs(thread, call),
        actor: {
          user: null,
          channel: { piece: 'microsoft-teams', id: '29:grace', name: 'Grace Hopper' },
        },
        outcome: { output: { answers: [{ header: 'Q1', selected: ['Red'] }] } },
      });

      server.reset();

      await teamsQuestions.stale!({
        ...hookArgs(thread, call),
        interaction: action({ from: members.ada }),
      });

      expect(JSON.stringify(cardOf(server.updates()[0]))).toContain('Answered by Grace Hopper');
      expect(server.targeted()).toMatchObject([
        { body: { text: 'This question was already answered.', recipient: { id: '29:ada' } } },
      ]);
    });

    it('closes a card that has no stored answer and says it is no longer open', async () => {
      const { thread } = await teamsThread();

      await teamsQuestions.stale!({
        ...hookArgs(thread, questionCall('call-1')),
        interaction: action(),
      });

      const [update] = server.updates();

      expect(cardInputs(update)).toEqual([]);
      expect(cardOf(update)).not.toHaveProperty('actions');
      expect(textRuns(cardOf(update)!.body).at(-1)).toMatchObject({
        text: 'This question is no longer open.',
      });
      expect(server.targeted()).toMatchObject([
        { body: { text: 'This question is no longer open.' } },
      ]);
    });

    it('still sends the notice when the card cannot be restored', async () => {
      const { thread } = await teamsThread();
      const call = questionCall('call-1');

      await teamsQuestions.settled({
        ...hookArgs(thread, call),
        actor: null,
        outcome: { dismissed: true },
      });

      server.reset();
      server.fail('PUT', 500);

      await expect(
        teamsQuestions.stale!({ ...hookArgs(thread, call), interaction: action() }),
      ).rejects.toThrow();
      expect(server.targeted()).toHaveLength(1);
    });
  });

  it('needs no updated or supports hook', () => {
    expect(teamsQuestions).not.toHaveProperty('updated');
    expect(teamsQuestions).not.toHaveProperty('supports');
  });
});
