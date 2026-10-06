import { describe, expect, it, vi } from 'vitest';

import type {
  ChannelQuestionCall,
  QuestionInteraction,
} from '../../../packages/frogbot/src/exports/pieces.js';
import {
  actionIds,
  decodeAction,
  optionPages,
  questionMessage,
  settledMessage,
  TEXT_BUDGET,
} from '../../../packages/pieces/piece-telegram-bot/src/questions/keyboard.js';
import { parseTelegramQuestion } from '../../../packages/pieces/piece-telegram-bot/src/questions/parse.js';
import {
  initialState,
  type TelegramQuestionState,
} from '../../../packages/pieces/piece-telegram-bot/src/questions/state.js';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

type Item = ChannelQuestionCall['input']['questions'][number];

const messageId = '-100:900';

function call(...questions: Array<Partial<Item> & Pick<Item, 'header'>>): ChannelQuestionCall {
  return {
    toolCallId: 'call-1',
    toolName: 'question',
    messageId: 'assistant-1',
    chatId: 'chat-1',
    agentSlug: 'support',
    createdAt: '2026-09-25T00:00:00.000Z',
    input: {
      questions: questions.map((item) => ({
        question: `Pick a ${item.header.toLowerCase()}`,
        options: [{ label: 'Red' }, { label: 'Blue' }],
        custom: true,
        ...item,
      })),
    },
  };
}

function options(count: number, label = (index: number) => `Option ${index + 1}`) {
  return Array.from({ length: count }, (_, index) => ({ label: label(index) }));
}

function state(overrides: Partial<TelegramQuestionState> = {}): TelegramQuestionState {
  return { ...initialState(), ...overrides };
}

function tap(actionId: string): QuestionInteraction {
  return {
    type: 'action',
    event: { actionId, user: { userId: '42', userName: 'frog', fullName: 'Frog' } },
  } as unknown as QuestionInteraction;
}

function reply(text: string, replyTo: string | null = messageId): QuestionInteraction {
  return {
    type: 'message',
    message: {
      id: '-100:901',
      text,
      author: { userId: '42', userName: 'frog', fullName: 'Frog' },
      ...(replyTo ? { replyTo: { id: replyTo } } : {}),
    },
  } as unknown as QuestionInteraction;
}

function parse(
  question: ChannelQuestionCall,
  interaction: QuestionInteraction,
  current: TelegramQuestionState = state(),
  settled = false,
) {
  return parseTelegramQuestion({
    call: question,
    interaction,
    question: {
      messages: [{ id: messageId, postedAt: '2026-09-26T00:00:00.000Z' }],
      revision: 0,
      state: current,
    },
    settled,
  });
}

function buttons(body: ReturnType<typeof questionMessage>) {
  return body.reply_markup.inline_keyboard.map((row) => row.map(({ text }) => text));
}

function plain(html: string) {
  return html
    .replace(/<\/?[bi]>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

describe('Telegram question messages', () => {
  it('renders a single choice with paired option buttons, a typed answer, and Dismiss', () => {
    const body = questionMessage({ call: call({ header: 'Color' }), state: state() });

    expect(body).toMatchObject({ parse_mode: 'HTML', text: '<b>Color</b>\nPick a color' });
    expect(buttons(body)).toEqual([
      ['Red', 'Blue'],
      ['Type your answer', 'Dismiss'],
    ]);
    expect(body.reply_markup.inline_keyboard[0].map(({ callback_data }) => callback_data)).toEqual([
      'q:0:o:0',
      'q:0:o:1',
    ]);
  });

  it('omits the typed answer when custom answers are off', () => {
    const body = questionMessage({
      call: call({ header: 'Color', custom: false }),
      state: state(),
    });

    expect(buttons(body).at(-1)).toEqual(['Dismiss']);
  });

  it('lists descriptions and full long labels in the text and gives long labels their own row', () => {
    const long = `Paint the whole house in a deep ocean blue ${'x'.repeat(20)}`;
    const body = questionMessage({
      call: call({
        header: 'Color',
        options: [{ label: 'Red', description: 'Warm & <bold>' }, { label: long }],
      }),
      state: state(),
    });

    expect(body.text).toContain('• <b>Red</b> — Warm &amp; &lt;bold&gt;');
    expect(body.text).toContain(`• <b>${long}</b>`);
    expect(buttons(body).slice(0, 2)).toEqual([['Red'], [`${long.slice(0, 47)}…`]]);
  });

  it('marks multi-select toggles and adds Done', () => {
    const body = questionMessage({
      call: call({ header: 'Colors', multiple: true, custom: false }),
      state: state({ selected: [1] }),
    });

    expect(buttons(body)).toEqual([['☐ Red', '☑ Blue'], ['Done'], ['Dismiss']]);
    expect(body.text).toContain('<i>Select all that apply, then tap Done.</i>');
    expect(body.reply_markup.inline_keyboard[1][0].callback_data).toBe('q:0:d');
  });

  it('shows progress through several questions', () => {
    const body = questionMessage({
      call: call({ header: 'Color' }, { header: 'Size' }, { header: 'Finish' }),
      state: state({ q: 1 }),
    });

    expect(body.text.split('\n')[0]).toBe('<b>Size</b> · 2 of 3');
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe('q:1:o:0');
  });

  it('asks for a reply in typing mode and offers Back', () => {
    const body = questionMessage({
      call: call({ header: 'Colors', multiple: true }),
      state: state({ selected: [0], typing: true }),
    });

    expect(body.text).toContain('Selected: Red');
    expect(body.text).toContain('<i>Reply to this message with your answer.</i>');
    expect(body.reply_markup.inline_keyboard).toEqual([
      [
        { text: '‹ Back', callback_data: 'q:0:b' },
        { text: 'Dismiss', callback_data: 'q:x' },
      ],
    ]);
  });

  it('keeps typing mode within the budget with many long selections', () => {
    const body = questionMessage({
      call: call({
        header: 'Parts',
        multiple: true,
        question: 'q'.repeat(3000),
        options: options(30, (index) => `${index} ${'P'.repeat(150)}`),
      }),
      state: state({ selected: options(30).map((_, index) => index), typing: true }),
    });

    expect(plain(body.text).length).toBeLessThanOrEqual(TEXT_BUDGET);
  });

  it.each([
    [10, [10]],
    [11, [10, 1]],
    [25, [10, 10, 5]],
  ])('pages %i options', (count, sizes) => {
    const item = call({ header: 'City', options: options(count) }).input.questions[0];

    expect(optionPages(item).map((page) => page.length)).toEqual(sizes);
  });

  it('navigates pages and keeps every option reachable', () => {
    const question = call({ header: 'City', options: options(11) });
    const first = questionMessage({ call: question, state: state() });
    const second = questionMessage({ call: question, state: state({ page: 1 }) });

    expect(buttons(first).at(-2)).toEqual(['Next ›']);
    expect(first.text).toContain('Options 1–10 of 11.');
    expect(buttons(second)).toEqual([['Option 11'], ['‹ Prev'], ['Type your answer', 'Dismiss']]);
    expect(second.reply_markup.inline_keyboard[1][0].callback_data).toBe('q:0:p:0');
  });

  it('keeps 100 long options with descriptions within the text budget without dropping any', () => {
    const question = call({
      header: 'Plan',
      multiple: true,
      question: 'q'.repeat(3000),
      options: Array.from({ length: 100 }, (_, index) => ({
        label: `${index + 1} ${'L'.repeat(80)}`,
        description: 'D'.repeat(600),
      })),
    });

    const item = question.input.questions[0];
    const pages = optionPages(item);

    expect(pages.flat()).toEqual(item.options.map((_, index) => index));

    pages.forEach((_, page) => {
      const body = questionMessage({ call: question, state: state({ page }) });

      expect(plain(body.text).length).toBeLessThanOrEqual(TEXT_BUDGET);
    });
  });

  it('keeps every callback payload within Telegram’s 64-byte limit', () => {
    const question = call(
      ...Array.from({ length: 20 }, (_, q) => ({
        header: `Question ${q}`,
        multiple: q % 2 === 0,
        options: options(99),
      })),
    );

    const payloads = question.input.questions.flatMap((item, q) =>
      optionPages(item).flatMap((_, page) =>
        questionMessage({ call: question, state: state({ q, page }) })
          .reply_markup.inline_keyboard.flat()
          .map(({ callback_data }) => callback_data),
      ),
    );

    expect(Math.max(...payloads.map((data) => Buffer.byteLength(data)))).toBeLessThanOrEqual(64);
  });

  it('escapes model text for HTML but keeps button labels verbatim', () => {
    const label = '*bold* _x_ [a](b) <tag> & 1. ~`#';
    const body = questionMessage({
      call: call({ header: 'A<B', question: 'Use <script> & stuff?', options: [{ label }] }),
      state: state(),
    });

    expect(body.text).toBe('<b>A&lt;B</b>\nUse &lt;script&gt; &amp; stuff?');
    expect(body.reply_markup.inline_keyboard[0][0].text).toBe(label);
  });

  it('summarizes answers with the responder and removes the keyboard', () => {
    const body = settledMessage({
      actor: 'Frog Smith',
      answers: [
        { header: 'Colors', selected: ['Red', 'Blue'], custom: 'Teal' },
        { header: 'Size', selected: ['L'] },
      ],
      call: call({ header: 'Colors', multiple: true }, { header: 'Size' }),
    });

    expect(body.text).toBe(
      [
        '<b>Colors</b>',
        'Pick a colors',
        '✅ Red, Blue, “Teal”',
        '',
        '<b>Size</b>',
        'Pick a size',
        '✅ L',
        '',
        '<i>Answered by Frog Smith</i>',
      ].join('\n'),
    );
    expect(body.reply_markup.inline_keyboard).toEqual([]);
  });

  it('summarizes a dismissal and an answer recorded elsewhere', () => {
    const question = call({ header: 'Color' });

    expect(settledMessage({ actor: 'Frog', call: question }).text).toMatch(
      /<i>🚫 Dismissed by Frog<\/i>$/,
    );
    expect(
      settledMessage({ answers: [{ header: 'Color', selected: ['Red'] }], call: question }).text,
    ).toMatch(/<i>Answered<\/i>$/);
  });

  it('fits a long summary within the budget', () => {
    const question = call(
      ...Array.from({ length: 30 }, (_, q) => ({ header: `Q${q}`, question: 'x'.repeat(400) })),
    );
    const body = settledMessage({
      actor: 'Frog',
      answers: question.input.questions.map(({ header }) => ({
        header,
        selected: [],
        custom: 'y'.repeat(400),
      })),
      call: question,
    });

    expect(plain(body.text).length).toBeLessThanOrEqual(TEXT_BUDGET);
    expect(body.text).toContain('…\n\n<i>Answered by Frog</i>');
  });

  it('decodes its own action ids and nothing else', () => {
    expect(decodeAction(actionIds.choose(2, 7))).toEqual({ kind: 'choose', q: 2, index: 7 });
    expect(decodeAction(actionIds.toggle(0, 3))).toEqual({ kind: 'toggle', q: 0, index: 3 });
    expect(decodeAction(actionIds.page(1, 4))).toEqual({ kind: 'page', q: 1, page: 4 });
    expect(decodeAction(actionIds.done(1))).toEqual({ kind: 'done', q: 1 });
    expect(decodeAction(actionIds.type(1))).toEqual({ kind: 'type', q: 1 });
    expect(decodeAction(actionIds.back(1))).toEqual({ kind: 'back', q: 1 });
    expect(decodeAction(actionIds.dismiss)).toEqual({ kind: 'dismiss' });
    expect(decodeAction('chat:{"a":"q:0:o:1"}')).toBeUndefined();
    expect(decodeAction('q:0:o:')).toBeUndefined();
    expect(decodeAction(undefined)).toBeUndefined();
  });
});

describe('Telegram question parsing', () => {
  it('maps a tapped index back to the exact label', () => {
    const labels = ['Rot · 赤', '*Blue*', 'Blue ', 'x'.repeat(300)];
    const question = call({ header: 'Color', options: labels.map((label) => ({ label })) });

    labels.forEach((label, index) => {
      expect(parse(question, tap(actionIds.choose(0, index)))).toEqual({
        kind: 'answer',
        output: { answers: [{ header: 'Color', selected: [label] }] },
      });
    });
  });

  it('sends a tap on another question of the set to stale', () => {
    const question = call({ header: 'Color' }, { header: 'Size' });

    expect(parse(question, tap(actionIds.choose(0, 0)), state({ q: 1 }))).toEqual({
      kind: 'stale',
    });
    expect(parse(question, tap(actionIds.type(1)))).toEqual({ kind: 'stale' });
  });

  it('ignores an unknown option, a control of the wrong shape, or a foreign payload', () => {
    const question = call({ header: 'Color' }, { header: 'Size' });

    expect(parse(question, tap(actionIds.choose(0, 5)))).toEqual({ kind: 'ignore' });
    expect(parse(question, tap('telegram_callback'))).toEqual({ kind: 'ignore' });
    expect(parse(question, tap(actionIds.toggle(0, 0)))).toEqual({ kind: 'ignore' });
  });

  it('walks several questions through partial state, then answers', () => {
    const question = call({ header: 'Color' }, { header: 'Size', options: options(2) });
    const first = parse(question, tap(actionIds.choose(0, 1)));

    expect(first).toEqual({
      kind: 'partial',
      state: state({ q: 1, answers: [{ header: 'Color', selected: ['Blue'] }] }),
    });

    const next = (first as { state: TelegramQuestionState }).state;

    expect(parse(question, tap(actionIds.choose(1, 0)), next)).toEqual({
      kind: 'answer',
      output: {
        answers: [
          { header: 'Color', selected: ['Blue'] },
          { header: 'Size', selected: ['Option 1'] },
        ],
      },
    });
  });

  it('toggles selections and submits them in option order', () => {
    const question = call({ header: 'Colors', multiple: true, options: options(3) });

    expect(parse(question, tap(actionIds.toggle(0, 2)), state({ selected: [0] }))).toEqual({
      kind: 'partial',
      state: state({ selected: [0, 2] }),
    });
    expect(parse(question, tap(actionIds.toggle(0, 0)), state({ selected: [0, 2] }))).toEqual({
      kind: 'partial',
      state: state({ selected: [2] }),
    });
    expect(parse(question, tap(actionIds.done(0)), state({ selected: [2, 0] }))).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Colors', selected: ['Option 1', 'Option 3'] }] },
    });
  });

  it('rejects Done with nothing selected', () => {
    const question = call({ header: 'Colors', multiple: true });

    expect(parse(question, tap(actionIds.done(0)))).toEqual({
      kind: 'rejected',
      reason: 'Select at least one option, then tap Done.',
    });
  });

  it('pages within range, and redraws on a repeated page tap', () => {
    const question = call({ header: 'City', options: options(11) });

    expect(parse(question, tap(actionIds.page(0, 1)))).toEqual({
      kind: 'partial',
      state: state({ page: 1 }),
    });
    expect(parse(question, tap(actionIds.page(0, 2)))).toEqual({ kind: 'ignore' });
    expect(parse(question, tap(actionIds.page(0, 0)))).toEqual({
      kind: 'partial',
      state: state(),
    });
  });

  it('arms and disarms a typed answer, redrawing on a repeated tap', () => {
    const question = call({ header: 'Color' });

    expect(parse(question, tap(actionIds.type(0)))).toEqual({
      kind: 'partial',
      state: state({ typing: true }),
    });
    expect(parse(question, tap(actionIds.back(0)), state({ typing: true }))).toEqual({
      kind: 'partial',
      state: state(),
    });
    expect(parse(question, tap(actionIds.type(0)), state({ typing: true }))).toEqual({
      kind: 'partial',
      state: state({ typing: true }),
    });
    expect(parse(question, tap(actionIds.back(0)))).toEqual({ kind: 'partial', state: state() });
    expect(parse(call({ header: 'Color', custom: false }), tap(actionIds.type(0)))).toEqual({
      kind: 'ignore',
    });
  });

  it('dismisses from any question', () => {
    expect(
      parse(call({ header: 'Color' }), tap(actionIds.dismiss), state({ typing: true })),
    ).toEqual({ kind: 'dismiss' });
  });

  it('accepts a typed answer only as a reply to the question message while armed', () => {
    const question = call({ header: 'Color' });
    const armed = state({ typing: true });

    expect(parse(question, reply(' Green '), armed)).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Color', selected: [], custom: 'Green' }] },
    });
    expect(parse(question, reply('Green'))).toEqual({ kind: 'ignore' });
    expect(parse(question, reply('Green', null), armed)).toEqual({ kind: 'ignore' });
    expect(parse(question, reply('Green', '-100:899'), armed)).toEqual({ kind: 'ignore' });
    expect(parse(question, reply('Green', '-200:900'), armed)).toEqual({ kind: 'ignore' });
    expect(parse(question, reply('/green'), armed)).toMatchObject({ kind: 'answer' });
  });

  it('keeps toggled options with a typed answer on a multi-select question', () => {
    const question = call({ header: 'Colors', multiple: true });

    expect(parse(question, reply('Teal'), state({ selected: [1], typing: true }))).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Colors', selected: ['Blue'], custom: 'Teal' }] },
    });
  });

  it('rejects an empty reply', () => {
    expect(parse(call({ header: 'Color' }), reply('   '), state({ typing: true }))).toEqual({
      kind: 'rejected',
      reason: 'Reply with your answer as text.',
    });
  });

  it('classifies taps the same way once settled, so core sends them to stale', () => {
    const question = call({ header: 'Color' });

    expect(parse(question, tap(actionIds.dismiss), state(), true)).toEqual({ kind: 'dismiss' });
    expect(parse(question, tap(actionIds.choose(0, 0)), state(), true)).toMatchObject({
      kind: 'answer',
    });
  });

  it('lets a reply to an answered question reach the agent', () => {
    expect(parse(call({ header: 'Color' }), reply('Green'), state({ typing: true }), true)).toEqual(
      {
        kind: 'ignore',
      },
    );
  });

  it('reads missing or malformed state as the first step and ignores forms', () => {
    const question = call({ header: 'Color' }, { header: 'Size' });
    const modal = { type: 'modalSubmit', event: {} } as QuestionInteraction;

    expect(
      parseTelegramQuestion({
        call: question,
        interaction: tap(actionIds.choose(0, 0)),
        question: { messages: [{ id: messageId, postedAt: '' }], revision: 0 },
        settled: false,
      }),
    ).toMatchObject({ kind: 'partial', state: { q: 1 } });
    expect(parse(question, tap(actionIds.choose(0, 0)), { ...state(), page: -1 })).toMatchObject({
      kind: 'partial',
      state: { q: 1 },
    });
    expect(parse(question, modal)).toEqual({ kind: 'ignore' });
  });

  it('does not mutate the stored state', () => {
    const current = Object.freeze(state({ selected: Object.freeze([0]) as number[] }));

    expect(() =>
      parse(call({ header: 'Colors', multiple: true }), tap(actionIds.toggle(0, 1)), current),
    ).not.toThrow();
    expect(current.selected).toEqual([0]);
  });
});
