import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingCall } from '../../../../packages/frogbot/src/chat/turn/types.js';
import { question, type QuestionInput } from '../../../../packages/frogbot/src/tools/question.js';
import { createFrogBotTelegramAdapter } from '../../../../packages/pieces/piece-telegram-bot/src/adapter.js';
import { createTelegramBotClient } from '../../../../packages/pieces/piece-telegram-bot/src/client.js';
import { telegramQuestions } from '../../../../packages/pieces/piece-telegram-bot/src/questions/index.js';
import { channelFixture } from './helpers.js';
import {
  buttonData,
  callbackUpdate,
  createTelegramApi,
  keyboard,
  messageUpdate,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET,
  telegramUsers,
  telegramWebhook,
} from './telegramFixtures.js';

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

const group = -100123;

const silent = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silent,
};

const colorQuestion: QuestionInput = {
  questions: [
    {
      header: 'Color',
      question: 'Pick a color',
      options: [{ label: 'Red' }, { label: 'Blue' }, { label: 'Green' }],
      custom: true,
    },
  ],
};

function pendingCall(input: QuestionInput = colorQuestion): PendingCall {
  return {
    toolCallId: 'call-1',
    toolName: 'question',
    input,
    messageId: 'assistant-1',
    chatId: 'chat-1',
    agentSlug: 'support',
    createdAt: '2026-09-25T00:00:00.000Z',
  };
}

async function asked({
  allowedUserIds,
  chatId = telegramUsers.frog.id,
  input,
  topic,
}: {
  allowedUserIds?: string[];
  chatId?: number;
  input?: QuestionInput;
  topic?: number;
} = {}) {
  const api = createTelegramApi();

  vi.stubGlobal('fetch', vi.fn(api.fetch));

  const fixture = channelFixture({
    slug: 'telegramBot',
    adapter: createFrogBotTelegramAdapter({
      botToken: TELEGRAM_BOT_TOKEN,
      secretToken: TELEGRAM_WEBHOOK_SECRET,
      userName: 'frogbot',
      mode: 'webhook',
      allowedUserIds,
      logger: silent,
    }),
    client: createTelegramBotClient({ auth: { botToken: TELEGRAM_BOT_TOKEN } }),
    questions: telegramQuestions as never,
  });

  Object.assign(fixture.frogbot.agents.support.config, { tools: [question] });

  await fixture.host.initialize(false);

  const webhook = (update: Record<string, unknown>) =>
    fixture.host.webhook('telegramBot', telegramWebhook(update));

  const run = async (index = fixture.inputs.length - 1) => {
    const task = fixture.host.run(JSON.parse(JSON.stringify(fixture.inputs[index])));

    await vi.runAllTimersAsync();
    await task;
  };

  await webhook(messageUpdate({ chatId, topic, text: chatId < 0 ? '@frogbot paint' : 'Paint' }));

  listPendingCalls.mockResolvedValueOnce([pendingCall(input)]);

  await run(0);

  const cardId = api.lastMessageId();

  const edits = () =>
    api.calls
      .filter(({ method, result }) => method === 'editMessageText' && result?.message_id === cardId)
      .map(({ body }) => body);

  const card = () => edits().at(-1) ?? api.cards().at(-1);

  const tap = (
    label: string,
    from: (typeof telegramUsers)[keyof typeof telegramUsers] = telegramUsers.frog,
  ) =>
    webhook(
      callbackUpdate({ chatId, topic, from, messageId: cardId, data: buttonData(card(), label) }),
    );

  return { ...fixture, api, card, cardId, edits, run, tap, webhook };
}

beforeEach(() => {
  vi.useFakeTimers();
  listPendingCalls.mockReset().mockResolvedValue([]);

  settleClientToolCall
    .mockReset()
    .mockResolvedValue({ status: 'settled', part: {}, allSettled: true });

  continueTurn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Telegram native questions through the installed adapter and channel host', () => {
  it('settles a DM tap, marks the card answered, and queues one continuation', async () => {
    const fixture = await asked();

    expect(fixture.card()).toMatchObject({ chat_id: '42', text: '<b>Color</b>\nPick a color' });

    await fixture.tap('Blue');

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(settleClientToolCall.mock.calls[0][0]).toMatchObject({
      outcome: { output: { answers: [{ header: 'Color', selected: ['Blue'] }] } },
      actor: {
        user: null,
        channel: { piece: 'telegramBot', account: 'telegramBot', id: '42', name: 'Frog Smith' },
      },
    });
    expect(fixture.api.of('answerCallbackQuery')).toHaveLength(1);
    expect(fixture.card()).toMatchObject({
      message_id: fixture.cardId,
      text: expect.stringMatching(/✅ Blue\n\n<i>Answered by Frog Smith<\/i>$/),
      reply_markup: { inline_keyboard: [] },
    });
    expect(fixture.inputs.at(-1)).toMatchObject({ kind: 'continue', responder: { userId: '42' } });

    await fixture.host.shutdown();
  });

  it('records nothing for a second tap on the answered card or a replayed update', async () => {
    const fixture = await asked();
    const update = callbackUpdate({ messageId: fixture.cardId, data: 'q:0:o:0' });

    await fixture.host.webhook('telegramBot', telegramWebhook(update, { updateId: 90_001 }));

    const edits = fixture.edits().length;
    const jobs = fixture.inputs.length;

    await fixture.host.webhook('telegramBot', telegramWebhook(update, { updateId: 90_001 }));
    await fixture.webhook(callbackUpdate({ messageId: fixture.cardId, data: 'q:0:o:1' }));

    expect(settleClientToolCall).toHaveBeenCalledOnce();
    expect(fixture.edits().slice(edits)).toEqual([
      expect.objectContaining({
        text: fixture.edits()[edits - 1].text,
        reply_markup: { inline_keyboard: [] },
      }),
    ]);
    expect(fixture.api.of('answerCallbackQuery')).toHaveLength(2);
    expect(fixture.inputs).toHaveLength(jobs);

    await fixture.host.shutdown();
  });

  it('rejects a forged secret before anything is recorded', async () => {
    const fixture = await asked();
    const calls = fixture.api.calls.length;

    const response = await fixture.host.webhook(
      'telegramBot',
      telegramWebhook(callbackUpdate({ messageId: fixture.cardId, data: 'q:0:o:0' }), {
        secret: 'forged',
      }),
    );

    expect(response?.status).toBe(401);
    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.api.calls).toHaveLength(calls);

    await fixture.host.shutdown();
  });

  it('keeps toggles on the server and submits them in option order with Done', async () => {
    const fixture = await asked({
      input: {
        questions: [{ ...colorQuestion.questions[0], multiple: true, custom: false }],
      },
    });

    await fixture.tap('Green');
    await fixture.tap('Red');

    expect(
      keyboard(fixture.card())
        .flat()
        .map(({ text }) => text),
    ).toContain('☑ Green');

    expect(keyboard(fixture.card())[0].map(({ text }) => text)).toEqual(['☑ Red', '☐ Blue']);

    await fixture.tap('Done');

    expect(settleClientToolCall.mock.calls[0][0].outcome).toEqual({
      output: { answers: [{ header: 'Color', selected: ['Red', 'Green'] }] },
    });
    expect(fixture.edits()).toHaveLength(3);

    await fixture.host.shutdown();
  });

  it('redraws every toggle and ends on the settled card', async () => {
    const fixture = await asked({
      input: { questions: [{ ...colorQuestion.questions[0], multiple: true }] },
    });

    await fixture.tap('Red');
    await fixture.tap('Blue');
    await fixture.tap('Green');
    await fixture.tap('Done');

    expect(fixture.edits()).toHaveLength(4);
    expect(fixture.card()).toMatchObject({ reply_markup: { inline_keyboard: [] } });
    expect(settleClientToolCall.mock.calls[0][0].outcome.output.answers[0].selected).toEqual([
      'Red',
      'Blue',
      'Green',
    ]);

    await fixture.host.shutdown();
  });

  it('steps through several questions in one message and continues after the last', async () => {
    const fixture = await asked({
      input: {
        questions: [
          colorQuestion.questions[0],
          {
            header: 'Size',
            question: 'Pick a size',
            options: [{ label: 'S' }, { label: 'L' }],
            custom: true,
          },
        ],
      },
    });

    expect(String(fixture.card()!.text)).toContain('<b>Color</b> · 1 of 2');

    await fixture.tap('Red');

    expect(String(fixture.card()!.text)).toContain('<b>Size</b> · 2 of 2');
    expect(settleClientToolCall).not.toHaveBeenCalled();

    await fixture.tap('L');

    expect(settleClientToolCall.mock.calls[0][0].outcome).toEqual({
      output: {
        answers: [
          { header: 'Color', selected: ['Red'] },
          { header: 'Size', selected: ['L'] },
        ],
      },
    });

    await fixture.host.shutdown();
  });

  it('sends a tap on an earlier question of the set to stale', async () => {
    const fixture = await asked({
      input: {
        questions: [
          colorQuestion.questions[0],
          {
            header: 'Size',
            question: 'Pick a size',
            options: [{ label: 'S' }, { label: 'L' }],
            custom: true,
          },
        ],
      },
    });

    await fixture.tap('Red');

    const edits = fixture.edits().length;

    await fixture.webhook(callbackUpdate({ messageId: fixture.cardId, data: 'q:0:o:1' }));

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.edits()).toHaveLength(edits);
    expect(String(fixture.card()!.text)).toContain('<b>Size</b> · 2 of 2');

    await fixture.host.shutdown();
  });

  it('holds taps while the next question is still posting and redraws it from the retry job', async () => {
    const fixture = await asked({
      chatId: group,
      input: {
        questions: [
          colorQuestion.questions[0],
          {
            header: 'Size',
            question: 'Pick a size',
            options: [{ label: 'S' }, { label: 'L' }],
            custom: true,
          },
        ],
      },
    });

    fixture.api.fail('editMessageText', {
      error_code: 429,
      description: 'Too Many Requests: retry after 3',
      retry_after: 3,
    });

    await fixture.tap('Red');

    expect(fixture.inputs.at(-1)).toMatchObject({ kind: 'update', toolCallId: 'call-1' });
    expect(String(fixture.card()!.text)).toContain('<b>Color</b> · 1 of 2');

    const next = callbackUpdate({ chatId: group, messageId: fixture.cardId, data: 'q:1:o:1' });

    await fixture.webhook(next);

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.api.of('sendMessage').at(-1)).toMatchObject({
      text: 'The next question is still posting — try again in a moment.',
      reply_parameters: { message_id: fixture.cardId },
    });

    await fixture.run(fixture.inputs.findIndex(({ kind }) => kind === 'update'));

    expect(String(fixture.card()!.text)).toContain('<b>Size</b> · 2 of 2');

    await fixture.webhook(
      callbackUpdate({ chatId: group, messageId: fixture.cardId, data: 'q:1:o:1' }),
    );

    expect(settleClientToolCall.mock.calls[0][0].outcome.output.answers).toEqual([
      { header: 'Color', selected: ['Red'] },
      { header: 'Size', selected: ['L'] },
    ]);

    await fixture.host.shutdown();
  });

  it('captures a typed answer from a group reply without a mention and consumes it', async () => {
    const fixture = await asked({ chatId: group });

    await fixture.tap('Type your answer');

    expect(String(fixture.card()!.text)).toContain('Reply to this message with your answer.');

    await fixture.webhook(
      messageUpdate({
        chatId: group,
        from: telegramUsers.toad,
        replyTo: fixture.cardId,
        text: 'Teal',
      }),
    );

    await fixture.run();

    expect(settleClientToolCall.mock.calls[0][0]).toMatchObject({
      outcome: { output: { answers: [{ header: 'Color', selected: [], custom: 'Teal' }] } },
      actor: { channel: { id: '7', name: 'Toad Hall' } },
    });
    expect(fixture.streamMessage).toHaveBeenCalledOnce();

    await fixture.host.shutdown();
  });

  it('captures a reply that Telegram tags with a reply anchor in a group without topics', async () => {
    const fixture = await asked({ chatId: group });

    await fixture.tap('Type your answer');

    await fixture.webhook(
      messageUpdate({
        anchor: fixture.cardId,
        chatId: group,
        from: telegramUsers.toad,
        replyTo: fixture.cardId,
        text: '/teal',
      }),
    );

    await fixture.run();

    expect(fixture.inputs.at(-1)!.thread.id).toBe(`telegram:${group}`);
    expect(settleClientToolCall.mock.calls[0][0].outcome.output.answers[0].custom).toBe('/teal');

    await fixture.host.shutdown();
  });

  it('captures an anchored reply in the General topic of a forum group', async () => {
    const fixture = await asked({ chatId: group });

    await fixture.tap('Type your answer');

    await fixture.webhook(
      messageUpdate({
        anchor: fixture.cardId,
        chatId: group,
        forum: true,
        replyTo: fixture.cardId,
        text: 'Teal',
      }),
    );

    await fixture.run();

    expect(settleClientToolCall.mock.calls[0][0].outcome.output.answers[0].custom).toBe('Teal');

    await fixture.host.shutdown();
  });

  it('does not take a reply from another forum topic as the answer', async () => {
    const fixture = await asked({ chatId: group, topic: 7 });

    await fixture.tap('Type your answer');

    await fixture.webhook(
      messageUpdate({ chatId: group, replyTo: fixture.cardId, text: '@frogbot Teal', topic: 8 }),
    );

    await fixture.run();

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.inputs.at(-1)!.thread.id).toBe(`telegram:${group}:8`);
    expect(fixture.streamMessage).toHaveBeenCalledTimes(2);

    await fixture.host.shutdown();
  });

  it('passes ordinary chat and replies to other messages to the agent', async () => {
    const fixture = await asked({ chatId: group });

    await fixture.tap('Type your answer');
    await fixture.webhook(messageUpdate({ chatId: group, text: 'Actually, what about paint?' }));
    await fixture.run();

    await fixture.webhook(
      messageUpdate({ chatId: group, replyTo: fixture.cardId - 1, text: 'About your last reply' }),
    );

    await fixture.run();

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.streamMessage).toHaveBeenCalledTimes(3);

    await fixture.host.shutdown();
  });

  it('answers in the forum topic it was asked in', async () => {
    const fixture = await asked({ chatId: group, topic: 7 });

    expect(fixture.api.cards().at(-1)).toMatchObject({
      chat_id: String(group),
      message_thread_id: 7,
    });

    await fixture.tap('Green');

    expect(settleClientToolCall.mock.calls[0][0].outcome.output.answers[0].selected).toEqual([
      'Green',
    ]);

    await fixture.host.shutdown();
  });

  it('ignores a tap on the same message id in another chat', async () => {
    const fixture = await asked();

    await fixture.webhook(
      callbackUpdate({
        chatId: telegramUsers.toad.id,
        from: telegramUsers.toad,
        messageId: fixture.cardId,
        data: 'q:0:o:0',
      }),
    );

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.api.of('sendMessage').at(-1)).toBe(fixture.card());

    await fixture.host.shutdown();
  });

  it('tells a participant without access and keeps the question open', async () => {
    const fixture = await asked({ chatId: group });

    fixture.access.mockReturnValue(false);

    await fixture.tap('Red', telegramUsers.toad);
    await fixture.tap('Blue', telegramUsers.toad);

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.api.of('sendMessage').at(-1)).toMatchObject({
      text: "Toad Hall, you don't have access to answer this question.",
      reply_parameters: { message_id: fixture.cardId },
    });
    expect(fixture.api.cards()).toHaveLength(1);
    expect(
      fixture.api.of('sendMessage').filter(({ text }) => String(text).includes('access')),
    ).toHaveLength(2);

    await fixture.host.shutdown();
  });

  it('drops taps from users outside allowedUserIds before FrogBot sees them', async () => {
    const fixture = await asked({ allowedUserIds: ['42'] });
    const calls = fixture.api.calls.length;

    await fixture.tap('Red', telegramUsers.toad);

    expect(settleClientToolCall).not.toHaveBeenCalled();
    expect(fixture.api.calls).toHaveLength(calls);

    await fixture.host.shutdown();
  });

  it('dismisses without a continuation', async () => {
    const fixture = await asked();
    const jobs = fixture.inputs.length;

    await fixture.tap('Dismiss');

    expect(settleClientToolCall.mock.calls[0][0].outcome).toEqual({ dismissed: true });
    expect(String(fixture.card()!.text)).toMatch(/🚫 Dismissed by Frog Smith/);
    expect(fixture.inputs).toHaveLength(jobs);

    await fixture.host.shutdown();
  });

  it('pages a long list and answers with an option from the second page', async () => {
    const fixture = await asked({
      input: {
        questions: [
          {
            header: 'City',
            question: 'Pick a city',
            options: Array.from({ length: 12 }, (_, index) => ({ label: `City ${index + 1}` })),
            custom: false,
          },
        ],
      },
    });

    await fixture.tap('Next ›');

    expect(String(fixture.card()!.text)).toContain('Options 11–12 of 12.');

    await fixture.tap('City 12');

    expect(settleClientToolCall.mock.calls[0][0].outcome.output.answers[0].selected).toEqual([
      'City 12',
    ]);

    await fixture.host.shutdown();
  });
});
