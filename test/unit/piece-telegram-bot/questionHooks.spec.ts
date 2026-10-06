import { describe, expect, it, vi } from 'vitest';

import type {
  ChannelQuestionCall,
  QuestionInteraction,
  QuestionRecord,
} from '../../../packages/frogbot/src/exports/pieces.js';
import {
  TelegramApiError,
  type TelegramBotClient,
} from '../../../packages/pieces/piece-telegram-bot/src/client.js';
import { telegramQuestions } from '../../../packages/pieces/piece-telegram-bot/src/questions/index.js';
import {
  initialState,
  type TelegramQuestionState,
} from '../../../packages/pieces/piece-telegram-bot/src/questions/state.js';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

type Hooks = Required<typeof telegramQuestions>;

const postedAt = '2026-09-26T08:00:00.000Z';

const call: ChannelQuestionCall = {
  toolCallId: 'call-1',
  toolName: 'question',
  messageId: 'assistant-1',
  chatId: 'chat-1',
  agentSlug: 'support',
  createdAt: '2026-09-25T00:00:00.000Z',
  input: {
    questions: [
      {
        header: 'Color',
        question: 'Pick a color',
        options: [{ label: 'Red' }, { label: 'Blue' }],
        custom: true,
      },
      {
        header: 'Size',
        question: 'Pick a size',
        options: [{ label: 'S' }, { label: 'L' }],
        custom: true,
      },
    ],
  },
};

function record(state: Partial<TelegramQuestionState> = {}): QuestionRecord {
  return {
    messages: [{ id: '-100:900', postedAt }],
    revision: 1,
    state: { ...initialState(), ...state },
  };
}

function fixture({
  failures = [],
  threadId = 'telegram:-100:7',
}: {
  failures?: Error[];
  threadId?: string;
} = {}) {
  const requests: Array<{ method: string; body: Record<string, unknown> }> = [];
  const error = vi.fn();

  const client = {
    call: vi.fn((method: string, body: Record<string, unknown>) => {
      requests.push({ method, body });

      const failure = failures.shift();

      if (failure) return Promise.reject(failure);

      return Promise.resolve({
        ok: true,
        result: {
          message_id: 900,
          date: 1_790_409_600,
          chat: { id: Number(threadId.split(':')[1]) },
        },
      });
    }),
  } as unknown as TelegramBotClient;

  const req = { frogbot: { logger: { error } } } as never;
  const thread = { id: threadId, adapter: {} } as never;

  return { client, error, req, requests, thread };
}

function tap(
  actionId = 'q:0:o:0',
  user = { userId: '7', userName: 'toad', fullName: 'Toad Hall' },
): QuestionInteraction {
  return { type: 'action', event: { actionId, user } } as unknown as QuestionInteraction;
}

function reply(): QuestionInteraction {
  return {
    type: 'message',
    message: { id: '-100:905', text: 'Green', author: { userId: '7', fullName: 'Toad Hall' } },
  } as unknown as QuestionInteraction;
}

const rateLimited = () =>
  new TelegramApiError({
    method: 'editMessageText',
    code: 429,
    retryAfter: 3,
    description: 'Too Many Requests: retry after 3',
  });

describe('Telegram question hooks', () => {
  it('offers questions everywhere except Telegram Business threads', () => {
    const supports = telegramQuestions.supports!;

    expect(supports({ thread: { id: 'telegram:42' } as never })).toBe(true);
    expect(supports({ thread: { id: 'telegram:-100:7' } as never })).toBe(true);
    expect(supports({ thread: { id: 'telegram:biz:conn:42' } as never })).toBe(false);
  });

  it('posts the first call in its forum topic and returns its message and state', async () => {
    const { client, req, requests, thread } = fixture();

    const rendered = await telegramQuestions.render({
      calls: [call, { ...call, toolCallId: 'call-2' }],
      client,
      req,
      thread,
    });

    expect(rendered).toEqual([
      {
        calls: ['call-1'],
        messages: [{ id: '-100:900', postedAt: '2026-09-26T08:00:00.000Z' }],
        state: initialState(),
      },
    ]);
    expect(requests).toEqual([
      {
        method: 'sendMessage',
        body: expect.objectContaining({
          chat_id: '-100',
          message_thread_id: 7,
          parse_mode: 'HTML',
          text: '<b>Color</b> · 1 of 2\nPick a color',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Red', callback_data: 'q:0:o:0' },
                { text: 'Blue', callback_data: 'q:0:o:1' },
              ],
              [
                { text: 'Type your answer', callback_data: 'q:0:c' },
                { text: 'Dismiss', callback_data: 'q:x' },
              ],
            ],
          },
        }),
      },
    ]);
  });

  it('fails the render when Telegram returns no message id', async () => {
    const { client, req, thread } = fixture();

    vi.mocked(client.call).mockResolvedValueOnce({ ok: true, result: true });

    await expect(telegramQuestions.render({ calls: [call], client, req, thread })).rejects.toThrow(
      'did not return a message id',
    );
  });

  it('redraws the current message from the saved state without an interaction', async () => {
    const { client, req, requests, thread } = fixture();

    const change = await (telegramQuestions.updated as Hooks['updated'])({
      call,
      client,
      question: record({ q: 1, answers: [{ header: 'Color', selected: ['Red'] }] }),
      req,
      thread,
    });

    expect(change).toBeUndefined();
    expect(requests).toEqual([
      {
        method: 'editMessageText',
        body: expect.objectContaining({
          chat_id: '-100',
          message_id: 900,
          text: '<b>Size</b> · 2 of 2\nPick a size',
        }),
      },
    ]);
    expect(requests[0].body).not.toHaveProperty('message_thread_id');
  });

  it.each([
    ['a retry without an interaction', undefined],
    ['an answer that moves to the next question', tap('q:0:o:0')],
    ['a typed answer that moves to the next question', reply()],
  ])('throws when the next question is not visible yet, after %s', async (_, interaction) => {
    const { client, req, thread } = fixture({ failures: [rateLimited()] });

    await expect(
      (telegramQuestions.updated as Hooks['updated'])({
        call,
        client,
        interaction,
        question: record({ q: 1, answers: [{ header: 'Color', selected: ['Red'] }] }),
        req,
        thread,
      }),
    ).rejects.toBeInstanceOf(TelegramApiError);
  });

  it.each([['q:0:t:1'], ['q:0:c'], ['q:0:b'], ['q:0:p:1']])(
    'logs a failed redraw of the same question after %s and returns normally',
    async (actionId) => {
      const { client, error, req, thread } = fixture({ failures: [rateLimited()] });

      await expect(
        (telegramQuestions.updated as Hooks['updated'])({
          call,
          client,
          interaction: tap(actionId),
          question: record({ typing: true }),
          req,
          thread,
        }),
      ).resolves.toBeUndefined();

      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(TelegramApiError), toolCallId: 'call-1' }),
        '[piece-telegram-bot] Could not redraw a question.',
      );
    },
  );

  it('treats an unchanged message as drawn', async () => {
    const unchanged = new TelegramApiError({
      method: 'editMessageText',
      code: 400,
      description: 'Bad Request: message is not modified',
    });
    const { client, req, thread } = fixture({ failures: [unchanged] });

    await expect(
      (telegramQuestions.updated as Hooks['updated'])({
        call,
        client,
        question: record(),
        req,
        thread,
      }),
    ).resolves.toBeUndefined();
  });

  it('closes every message with the answer and returns the settled view', async () => {
    const { client, req, requests, thread } = fixture();

    const change = await telegramQuestions.settled({
      actor: {
        user: null,
        channel: { piece: 'telegramBot', id: '7', username: 'toad', name: 'Toad Hall' },
      },
      call,
      client,
      outcome: {
        output: {
          answers: [
            { header: 'Color', selected: ['Red'] },
            { header: 'Size', selected: [], custom: 'XL' },
          ],
        },
      },
      question: {
        ...record({ q: 1 }),
        messages: [
          { id: '-100:899', postedAt },
          { id: '-100:900', postedAt },
        ],
      },
      req,
      thread,
    });

    expect(requests.map(({ body }) => body.message_id)).toEqual([899, 900]);
    expect(requests[1].body).toMatchObject({
      text: expect.stringMatching(/✅ “XL”\n\n<i>Answered by Toad Hall<\/i>$/),
      reply_markup: { inline_keyboard: [] },
    });
    expect(change).toEqual({
      state: {
        ...initialState(),
        q: 1,
        settled: {
          actor: 'Toad Hall',
          answers: [
            { header: 'Color', selected: ['Red'] },
            { header: 'Size', selected: [], custom: 'XL' },
          ],
        },
      },
    });
  });

  it('keeps the settled view when the closing edit fails, so a later tap restores it', async () => {
    const { client, error, req, requests, thread } = fixture({ failures: [rateLimited()] });

    const change = await telegramQuestions.settled({
      actor: null,
      call,
      client,
      outcome: { dismissed: true },
      question: record(),
      req,
      thread,
    });

    expect(change).toEqual({ state: { ...initialState(), settled: {} } });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: 'call-1' }),
      '[piece-telegram-bot] Could not mark a question answered.',
    );

    await (telegramQuestions.stale as Hooks['stale'])({
      call,
      client,
      interaction: tap(),
      question: { ...record(), state: (change as { state: unknown }).state },
      req,
      thread,
    });

    expect(requests.at(-1)).toMatchObject({
      method: 'editMessageText',
      body: {
        message_id: 900,
        text: expect.stringMatching(/<i>🚫 Dismissed<\/i>$/),
        reply_markup: { inline_keyboard: [] },
      },
    });
  });

  it('stays silent on a stale tap of an open question and answers a stale reply', async () => {
    const { client, req, requests, thread } = fixture();
    const stale = telegramQuestions.stale as Hooks['stale'];

    await stale({ call, client, interaction: tap(), question: record(), req, thread });

    expect(requests).toEqual([]);

    await stale({ call, client, interaction: reply(), question: record(), req, thread });

    expect(requests[0].body).toMatchObject({
      text: 'This question was already answered.',
      reply_parameters: { message_id: 905 },
    });
  });

  it('tells a denied tapper by name, as a reply to the current message', async () => {
    const { client, req, requests, thread } = fixture();

    await (telegramQuestions.denied as Hooks['denied'])({
      call,
      client,
      interaction: tap(),
      question: record(),
      req,
      thread,
    });

    expect(requests).toEqual([
      {
        method: 'sendMessage',
        body: {
          chat_id: '-100',
          message_thread_id: 7,
          text: "Toad Hall, you don't have access to answer this question.",
          link_preview_options: { is_disabled: true },
          reply_parameters: { message_id: 900, allow_sending_without_reply: true },
        },
      },
    ]);
  });

  it('answers a denied reply under that reply', async () => {
    const { client, req, requests, thread } = fixture();

    await (telegramQuestions.denied as Hooks['denied'])({
      call,
      client,
      interaction: reply(),
      question: record(),
      req,
      thread,
    });

    expect(requests[0].body).toMatchObject({
      text: "You don't have access to answer this question.",
      reply_parameters: { message_id: 905 },
    });
  });

  it('shows the reason of a rejection, including the still-posting notice', async () => {
    const { client, req, requests, thread } = fixture();
    const reason = 'The next question is still posting — try again in a moment.';

    await (telegramQuestions.rejected as Hooks['rejected'])({
      call,
      client,
      interaction: tap(),
      question: record(),
      reason,
      req,
      thread,
    });

    expect(requests[0].body).toMatchObject({
      text: reason,
      reply_parameters: { message_id: 900 },
    });
  });
});
