import { describe, expect, it, vi } from 'vitest';

import type {
  ChannelQuestionCall,
  QuestionInteraction,
  QuestionParseResult,
} from '../../../packages/frogbot/src/exports/pieces.js';
import {
  DISCORD_LIMITS,
  questionPayload,
  settledPayload,
} from '../../../packages/pieces/piece-discord/src/questions/components.js';
import {
  callKey,
  decodeQuestionId,
  encodeQuestionId,
  snowflakeTime,
} from '../../../packages/pieces/piece-discord/src/questions/ids.js';
import { parseDiscordQuestion } from '../../../packages/pieces/piece-discord/src/questions/parse.js';
import {
  ARM_WINDOW_MS,
  type DiscordQuestionState,
  readState,
} from '../../../packages/pieces/piece-discord/src/questions/state.js';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

type Item = ChannelQuestionCall['input']['questions'][number];
type Component = { type: number; components?: Component[]; content?: string } & Record<
  string,
  unknown
>;

const DISCORD_EPOCH = 1_420_070_400_000;
const armedAt = Date.UTC(2026, 8, 25, 12, 0, 0);
const key = callKey('call-1');
const BOT_ID = '100000000000000001';
const TEAMMATE_ID = '200000000000000002';

function call(...questions: Array<Partial<Item> & Pick<Item, 'header'>>): ChannelQuestionCall {
  return {
    toolCallId: 'call-1',
    toolName: 'question',
    messageId: 'message-1',
    chatId: 'chat-1',
    agentSlug: 'support',
    createdAt: '2026-09-25T00:00:00.000Z',
    input: {
      questions: questions.map((item) => ({
        question: `Pick a ${item.header.toLowerCase()}`,
        options: [{ label: 'Red' }, { label: 'Blue' }, { label: 'Green' }],
        custom: true,
        ...item,
      })),
    },
  };
}

function options(count: number, label = (index: number) => `Option ${index}`) {
  return Array.from({ length: count }, (_, index) => ({ label: label(index) }));
}

function snowflake(ms: number): string {
  return String(BigInt(ms - DISCORD_EPOCH) << 22n);
}

function id(verb: Parameters<typeof encodeQuestionId>[0]['verb'], n?: number, q = 0) {
  return encodeQuestionId({ key, q, verb, n });
}

function click({
  actionId,
  at = armedAt,
  user = 'U1',
  values,
}: {
  actionId: string;
  at?: number;
  user?: string;
  values?: string[];
}): QuestionInteraction {
  return {
    type: 'action',
    event: {
      actionId,
      value: values?.[0] ?? actionId,
      user: { userId: user, userName: user.toLowerCase(), fullName: user },
      raw: { id: snowflake(at), data: { custom_id: actionId, ...(values ? { values } : {}) } },
    },
  } as unknown as QuestionInteraction;
}

function reply({
  at = armedAt + 60_000,
  text,
  user = 'U1',
}: {
  at?: number;
  text: string;
  user?: string;
}): QuestionInteraction {
  return {
    type: 'message',
    message: {
      id: snowflake(at),
      text,
      author: { userId: user, userName: user.toLowerCase(), fullName: user },
      metadata: { dateSent: new Date(at), edited: false },
      raw: { mentions: [{ id: BOT_ID, bot: true }, { id: TEAMMATE_ID }] },
    },
  } as unknown as QuestionInteraction;
}

function parse({
  input,
  interaction,
  settled = false,
  state,
}: {
  input: ChannelQuestionCall;
  interaction: QuestionInteraction;
  settled?: boolean;
  state?: unknown;
}): QuestionParseResult {
  return parseDiscordQuestion({ call: input, interaction, settled, state });
}

function partialState(result: QuestionParseResult): DiscordQuestionState {
  expect(result.kind).toBe('partial');

  return readState((result as { state?: unknown }).state);
}

function flatten(components: Component[]): Component[] {
  return components.flatMap((component) => [component, ...flatten(component.components ?? [])]);
}

function inspect(body: { components: Component[] }) {
  const all = flatten(body.components);

  return {
    all,
    count: all.length,
    text: all
      .filter(({ type }) => type === 10)
      .reduce((sum, { content }) => sum + content!.length, 0),
    texts: all.filter(({ type }) => type === 10).map(({ content }) => content!),
    buttons: all.filter(({ type }) => type === 2),
    selects: all.filter(({ type }) => type === 3) as Array<
      Component & { options: Array<{ label: string; value: string; description?: string }> }
    >,
  };
}

function payload(input: ChannelQuestionCall, state: Partial<DiscordQuestionState> = {}) {
  return questionPayload({ call: input, state: { ...readState(undefined), ...state } });
}

describe('Discord question ids', () => {
  it('round-trips every control id and keeps it within the custom_id limit', () => {
    const verbs = ['option', 'select', 'submit', 'custom', 'dismiss', 'page'] as const;

    verbs.forEach((verb) => {
      const encoded = encodeQuestionId({
        key,
        q: 12,
        verb,
        n: verb === 'option' ? 374 : undefined,
      });

      expect(encoded.length).toBeLessThanOrEqual(100);
      expect(encoded).not.toContain('\n');
      expect(decodeQuestionId(encoded)).toEqual({
        key,
        q: 12,
        verb,
        ...(verb === 'option' ? { n: 374 } : {}),
      });
    });
  });

  it('rejects ids that are not question controls', () => {
    expect(decodeQuestionId('approve')).toBeNull();
    expect(decodeQuestionId(`fbq:${key}:0:zz`)).toBeNull();
    expect(decodeQuestionId(`fbq:XYZ:0:d`)).toBeNull();
  });

  it('derives a stable key per tool call', () => {
    expect(callKey('call-1')).toBe(key);
    expect(callKey('call-1')).toMatch(/^[0-9a-f]{8}$/);
    expect(callKey('call-2')).not.toBe(key);
  });

  it('reads the time from a Discord snowflake', () => {
    expect(snowflakeTime(snowflake(armedAt))).toBe(armedAt);
    expect(snowflakeTime('not-a-snowflake')).toBeNaN();
  });
});

describe('Discord question components', () => {
  it('renders up to five short single-choice options as buttons with Other… and Dismiss', () => {
    const body = payload(call({ header: 'Color', options: options(5) }));
    const { buttons, selects } = inspect(body);

    expect(body).toMatchObject({ flags: 32768, allowed_mentions: { parse: [] } });
    expect(selects).toEqual([]);
    expect(buttons.map(({ label }) => label)).toEqual([
      'Option 0',
      'Option 1',
      'Option 2',
      'Option 3',
      'Option 4',
      'Other…',
      'Dismiss',
    ]);
    expect(buttons.map(({ custom_id }) => custom_id)).toEqual([
      id('option', 0),
      id('option', 1),
      id('option', 2),
      id('option', 3),
      id('option', 4),
      id('custom'),
      id('dismiss'),
    ]);
    expect(buttons.at(-1)).toMatchObject({ style: 4 });
  });

  it('uses a menu when options have descriptions and keeps each description', () => {
    const body = payload(
      call({
        header: 'Plan',
        options: [
          { label: 'Basic', description: 'Monthly' },
          { label: 'Pro', description: 'Yearly' },
        ],
      }),
    );
    const [select] = inspect(body).selects;

    expect(select).toMatchObject({ min_values: 1, max_values: 1, custom_id: id('select', 0) });
    expect(select!.options).toEqual([
      { label: 'Basic', value: '0', description: 'Monthly' },
      { label: 'Pro', value: '1', description: 'Yearly' },
    ]);
  });

  it('omits Other… when typed answers are not allowed', () => {
    const labels = inspect(payload(call({ header: 'Color', custom: false }))).buttons.map(
      ({ label }) => label,
    );

    expect(labels).toEqual(['Red', 'Blue', 'Green', 'Dismiss']);
  });

  it('renders multi-select as a menu sized to its options with Submit', () => {
    const { buttons, selects, texts } = inspect(
      payload(call({ header: 'Colors', multiple: true, options: options(7) })),
    );

    expect(selects).toHaveLength(1);
    expect(selects[0]).toMatchObject({ min_values: 0, max_values: 7 });
    expect(buttons[0]).toMatchObject({ label: 'Submit', style: 1, custom_id: id('submit') });
    expect(texts[0]).toContain('then press **Submit**');
  });

  it('shows progress, earlier answers, and Next inside a question set', () => {
    const input = call(
      { header: 'Color' },
      { header: 'Sizes', multiple: true },
      { header: 'Finish' },
    );
    const { buttons, texts } = inspect(
      payload(input, { q: 1, answers: [{ header: 'Color', selected: ['Red'] }] }),
    );

    expect(texts[0]).toContain('**Sizes** · 2 of 3');
    expect(texts[0]).toContain('✓ Color: Red');
    expect(buttons[0]).toMatchObject({ label: 'Next', custom_id: id('submit', undefined, 1) });
  });

  it.each([1, 5, 6, 25, 26, 375, 376, 1000])(
    'keeps %i options within the component and text limits without dropping any',
    (count) => {
      const input = call({ header: 'Pick', options: options(count), multiple: count % 2 === 0 });
      const pages = Array.from({ length: Math.max(1, Math.ceil(count / 375)) }, (_, page) =>
        inspect(payload(input, { page })),
      );

      const seen = pages.flatMap(({ buttons, selects }) => [
        ...selects.flatMap((select) => select.options.map(({ value }) => value)),
        ...buttons
          .map(({ custom_id }) => decodeQuestionId(String(custom_id)))
          .filter((control) => control?.verb === 'option')
          .map((control) => String(control!.n)),
      ]);

      pages.forEach((result) => {
        expect(result.count).toBeLessThanOrEqual(DISCORD_LIMITS.components);
        expect(result.text).toBeLessThanOrEqual(DISCORD_LIMITS.text);

        result.selects.forEach((select) => {
          expect(select.options.length).toBeLessThanOrEqual(25);
          expect(select.max_values).toBe(
            input.input.questions[0]!.multiple ? select.options.length : 1,
          );
        });
      });

      expect(seen).toEqual(Array.from({ length: count }, (_, index) => String(index)));
    },
  );

  it('pages beyond 375 options with page buttons and a page note', () => {
    const input = call({ header: 'Pick', options: options(376) });
    const first = inspect(payload(input));
    const second = inspect(payload(input, { page: 1 }));

    expect(first.selects).toHaveLength(15);
    expect(first.buttons.map(({ label, disabled }) => [label, disabled ?? false])).toEqual([
      ['◀', true],
      ['Page 2 ▶', false],
      ['Other…', false],
      ['Dismiss', false],
    ]);
    expect(first.texts.at(-1)).toContain('Page 1 of 2 · options 1–375 of 376.');
    expect(second.selects).toHaveLength(1);
    expect(second.selects[0]!.options).toEqual([{ label: 'Option 375', value: '375' }]);
    expect(second.buttons[0]).toMatchObject({ custom_id: id('page', 0) });
  });

  it('truncates long labels for display and lists their full text', () => {
    const long = `${'Very long option '.repeat(8)}end`;
    const { selects, texts } = inspect(
      payload(call({ header: 'Pick', options: [{ label: long }, { label: 'Short' }] })),
    );

    expect(selects[0]!.options[0]!.label).toHaveLength(100);
    expect(selects[0]!.options[0]!.label).toMatch(/^1\. Very long option .*….* end$/);
    expect(selects[0]!.options[1]!.label).toBe('Short');
    expect(texts[1]).toContain('Full text of shortened options');
    expect(texts[1]).toContain(`**1.** ${long}`);
  });

  it('numbers shortened labels so options that share a long prefix stay distinct', () => {
    const prefix = 'Deploy the service to the production cluster in region '.repeat(3);
    const input = call({
      header: 'Region',
      options: Array.from({ length: 25 }, (_, index) => ({ label: `${prefix}#${index}` })),
    });
    const { selects, texts } = inspect(payload(input));
    const labels = selects[0]!.options.map(({ label }) => label);

    expect(new Set(labels).size).toBe(25);
    expect(labels[9]).toMatch(/^10\. Deploy .*#9$/);
    expect(texts[1]).toContain(`**1.** ${prefix}\\#0`);
  });

  it('never splits an emoji when shortening text', () => {
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const emoji = '😀'.repeat(60);
    const open = inspect(
      payload(
        call({
          header: 'Mood',
          question: '🎉'.repeat(3000),
          options: [{ label: emoji, description: emoji }, { label: 'Plain' }],
        }),
      ),
    );
    const settled = inspect(
      settledPayload({
        call: call({ header: 'Mood' }),
        outcome: {
          output: { answers: [{ header: 'Mood', selected: [], custom: '🎉'.repeat(3000) }] },
        },
      }),
    );

    const strings = [
      open.selects[0]!.options[0]!.label,
      open.selects[0]!.options[0]!.description!,
      ...open.texts,
      ...settled.texts,
    ];

    strings.forEach((value) => expect(loneSurrogate.test(value)).toBe(false));
  });

  it('stays within the limits with every feature on at once', () => {
    const input = call(
      { header: 'First', options: [{ label: 'A' }] },
      {
        header: 'Second',
        question: 'Q '.repeat(5000),
        multiple: true,
        options: Array.from({ length: 1000 }, (_, index) => ({
          label: `${'x'.repeat(150)} ${index} <@123> @everyone **bold** \\`,
          description: 'd'.repeat(300),
        })),
      },
    );
    const armed = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [
        String(100000000000000000n + BigInt(index)),
        { at: armedAt, name: 'n'.repeat(40), picks: [0, 1, 2, 3, 4, 5] },
      ]),
    );

    const pages = [0, 1, 2].map((page) =>
      inspect(
        payload(input, {
          q: 1,
          page,
          armed,
          answers: [{ header: 'First', selected: [], custom: 'z'.repeat(5000) }],
        }),
      ),
    );

    pages.forEach((result) => {
      expect(result.count).toBeLessThanOrEqual(DISCORD_LIMITS.components);
      expect(result.text).toBeLessThanOrEqual(DISCORD_LIMITS.text);
      expect(result.buttons.length).toBeLessThanOrEqual(5);

      result.buttons.forEach(({ label }) => expect(String(label).length).toBeLessThanOrEqual(80));
      result.selects.forEach((select) => {
        expect(select.options.length).toBeLessThanOrEqual(25);
        expect(String(select.custom_id).length).toBeLessThanOrEqual(100);

        select.options.forEach(({ description, label }) => {
          expect(label.length).toBeLessThanOrEqual(100);
          expect((description ?? '').length).toBeLessThanOrEqual(100);
        });
      });
    });
  });

  it('keeps a long settled card within the text limit and keeps the responder line', () => {
    const input = call(
      ...Array.from({ length: 60 }, (_, index) => ({
        header: `H${index}`,
        question: 'q'.repeat(500),
      })),
    );
    const { text, texts } = inspect(
      settledPayload({
        call: input,
        outcome: {
          output: {
            answers: input.input.questions.map(({ header }) => ({
              header,
              selected: [],
              custom: 'c'.repeat(1000),
            })),
          },
        },
        responder: { id: 'U2', name: 'Toad' },
      }),
    );

    expect(text).toBeLessThanOrEqual(DISCORD_LIMITS.text);
    expect(texts[0]!.endsWith('-# Answered by **Toad**')).toBe(true);
  });

  it('neutralises mentions and markdown from a typed answer and a display name', () => {
    const { texts } = inspect(
      settledPayload({
        call: call({ header: 'Notes' }),
        outcome: {
          output: {
            answers: [
              { header: 'Notes', selected: [], custom: '<@123> <@&456> **x** [a](http://e)' },
            ],
          },
        },
        responder: { id: 'U1', name: '**Boss** <@999>', username: 'boss' },
      }),
    );

    expect(texts[0]).toContain('\\<@123\\> \\<@&456\\> \\*\\*x\\*\\* \\[a\\]\\(http://e\\)');
    expect(texts[0]).toContain('by **\\*\\*Boss\\*\\* \\<@999\\>** (@boss)');
  });

  it('keeps a very long question within the text limit', () => {
    const { text } = inspect(payload(call({ header: 'Essay', question: 'Why? '.repeat(2000) })));

    expect(text).toBeLessThanOrEqual(DISCORD_LIMITS.text);
  });

  it('lists who is typing and the picks they keep', () => {
    const { texts } = inspect(
      payload(call({ header: 'Colors', multiple: true }), {
        armed: {
          U1: { at: armedAt, name: 'Toad', picks: [0, 2] },
          U2: { at: armedAt, picks: [] },
        },
      }),
    );

    expect(texts.at(-1)).toBe(
      [
        '✏️ **Toad**, reply in this thread with your answer. Keeps Red, Green.',
        '✏️ <@U2>, reply in this thread with your answer.',
      ].join('\n'),
    );
  });

  it('escapes model text in markdown', () => {
    const { texts } = inspect(payload(call({ header: '*Bold* _x_' })));

    expect(texts[0]).toContain('**\\*Bold\\* \\_x\\_**');
  });

  it('retires the card with the answer and the responder, without controls', () => {
    const body = settledPayload({
      call: call({ header: 'Color' }, { header: 'Notes' }),
      responder: { id: 'U2', name: 'Toad', username: 'toad' },
      outcome: {
        output: {
          answers: [
            { header: 'Color', selected: ['Red'] },
            { header: 'Notes', selected: [], custom: 'Make it *matte*' },
          ],
        },
      },
    });
    const result = inspect(body);

    expect(body.flags).toBe(32768);
    expect(result.buttons).toEqual([]);
    expect(result.selects).toEqual([]);
    expect(result.texts[0]).toContain('✅ **Red**');
    expect(result.texts[0]).toContain('✅ **“Make it \\*matte\\*”**');
    expect(result.texts[0]!.endsWith('-# Answered by **Toad** (@toad)')).toBe(true);
  });

  it('retires a dismissed card and a card answered elsewhere', () => {
    const dismissed = inspect(
      settledPayload({
        call: call({ header: 'Color' }),
        outcome: { dismissed: true },
        responder: { id: 'U3' },
      }),
    );
    const elsewhere = inspect(
      settledPayload({
        call: call({ header: 'Color' }),
        outcome: { output: { answers: [{ header: 'Color', selected: ['Blue'] }] } },
      }),
    );

    expect(dismissed.texts[0]).toContain('🚫 **Dismissed**');
    expect(dismissed.texts[0]!.endsWith('-# Dismissed by <@U3>')).toBe(true);
    expect(elsewhere.texts[0]!.endsWith('-# Answered')).toBe(true);
  });
});

describe('Discord question parsing', () => {
  it('maps an option button back to its exact label', () => {
    const input = call({ header: 'Color', options: options(5, (index) => `Label ${index}!`) });

    expect(parse({ input, interaction: click({ actionId: id('option', 3) }) })).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Color', selected: ['Label 3!'] }] },
    });
  });

  it('maps indexes past the first menu back to their labels', () => {
    const input = call({ header: 'Pick', options: options(400, (index) => `Choice #${index}`) });

    const result = parse({
      input,
      interaction: click({ actionId: id('select', 15), values: ['399'] }),
      state: { page: 1 },
    });

    expect(result).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Pick', selected: ['Choice #399'] }] },
    });
  });

  it('keeps the full label when the display label was truncated', () => {
    const long = `${'Long '.repeat(40)}label`;
    const input = call({ header: 'Pick', options: [{ label: long }, { label: 'Short' }] });

    const result = parse({
      input,
      interaction: click({ actionId: id('select', 0), values: ['0'] }),
    });

    expect(result).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Pick', selected: [long] }] },
    });
  });

  it('ignores values outside the menu that sent them', () => {
    const input = call({ header: 'Pick', options: options(30) });

    expect(
      parse({ input, interaction: click({ actionId: id('select', 0), values: ['26'] }) }),
    ).toEqual({
      kind: 'ignore',
    });
    expect(
      parse({ input, interaction: click({ actionId: id('select', 0), values: ['x'] }) }),
    ).toEqual({
      kind: 'ignore',
    });
  });

  it('ignores a menu from another page', () => {
    const input = call({ header: 'Pick', options: options(400) });

    expect(
      parse({ input, interaction: click({ actionId: id('select', 15), values: ['399'] }) }),
    ).toEqual({
      kind: 'ignore',
    });
  });

  it('advances a question set and answers with every label after the last question', () => {
    const input = call(
      { header: 'Color' },
      { header: 'Size', options: [{ label: 'S' }, { label: 'L' }] },
    );

    const first = partialState(parse({ input, interaction: click({ actionId: id('option', 2) }) }));

    expect(first).toEqual({
      q: 1,
      page: 0,
      answers: [{ header: 'Color', selected: ['Green'] }],
      picks: {},
      armed: {},
    });
    expect(
      parse({ input, interaction: click({ actionId: id('option', 1, 1) }), state: first }),
    ).toEqual({
      kind: 'answer',
      output: {
        answers: [
          { header: 'Color', selected: ['Green'] },
          { header: 'Size', selected: ['L'] },
        ],
      },
    });
  });

  it('ignores a click on an earlier question after the card advanced', () => {
    const input = call({ header: 'Color' }, { header: 'Size' });

    expect(
      parse({ input, interaction: click({ actionId: id('option', 0) }), state: { q: 1 } }),
    ).toEqual({
      kind: 'ignore',
    });
  });

  it('ignores controls that belong to another call', () => {
    const foreign = encodeQuestionId({ key: callKey('call-2'), q: 0, verb: 'dismiss' });

    expect(
      parse({ input: call({ header: 'Color' }), interaction: click({ actionId: foreign }) }),
    ).toEqual({
      kind: 'ignore',
    });
    expect(
      parse({ input: call({ header: 'Color' }), interaction: click({ actionId: 'approve' }) }),
    ).toEqual({
      kind: 'ignore',
    });
  });

  it('dismisses', () => {
    expect(
      parse({ input: call({ header: 'Color' }), interaction: click({ actionId: id('dismiss') }) }),
    ).toEqual({
      kind: 'dismiss',
    });
  });

  it('stores multi-select picks per participant and submits only the submitter’s picks', () => {
    const input = call({ header: 'Colors', multiple: true });

    const one = partialState(
      parse({ input, interaction: click({ actionId: id('select', 0), values: ['2', '0'] }) }),
    );
    const two = partialState(
      parse({
        input,
        interaction: click({ actionId: id('select', 0), values: ['1'], user: 'U2' }),
        state: one,
      }),
    );

    expect(two.picks).toEqual({ U1: { 0: [0, 2] }, U2: { 0: [1] } });
    expect(parse({ input, interaction: click({ actionId: id('submit') }), state: two })).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Colors', selected: ['Red', 'Green'] }] },
    });
  });

  it('submits picks from every page in option order', () => {
    const input = call({ header: 'Pick', multiple: true, options: options(400) });
    const state = { page: 1, picks: { U1: { 0: [3], 15: [399] } } };

    expect(parse({ input, interaction: click({ actionId: id('submit') }), state })).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Pick', selected: ['Option 3', 'Option 399'] }] },
    });
  });

  it('rejects Submit with no picks', () => {
    const result = parse({
      input: call({ header: 'Colors', multiple: true }),
      interaction: click({ actionId: id('submit') }),
    });

    expect(result).toEqual({
      kind: 'rejected',
      reason: 'Pick at least one option first, or press **Other…** to type an answer.',
    });
  });

  it('changes page and clears the picks in the menus it redraws', () => {
    const input = call({ header: 'Pick', multiple: true, options: options(400) });
    const state = { picks: { U1: { 0: [1] }, U2: { 15: [399] } } };

    const next = partialState(
      parse({ input, interaction: click({ actionId: id('page', 1) }), state }),
    );

    expect(next.page).toBe(1);
    expect(next.picks).toEqual({ U1: { 0: [1] } });
    expect(parse({ input, interaction: click({ actionId: id('page', 7) }), state })).toEqual({
      kind: 'ignore',
    });
  });

  it('arms Other… at the interaction time and disarms on a second press', () => {
    const input = call({ header: 'Colors', multiple: true });
    const state = { picks: { U1: { 0: [2] }, U2: { 0: [0] } } };

    const armed = partialState(
      parse({ input, interaction: click({ actionId: id('custom') }), state }),
    );

    expect(armed.armed).toEqual({ U1: { at: armedAt, name: 'U1', picks: [2] } });
    expect(armed.picks).toEqual({});

    const disarmed = partialState(
      parse({
        input,
        interaction: click({ actionId: id('custom'), at: armedAt + 5000 }),
        state: armed,
      }),
    );

    expect(disarmed.armed).toEqual({});
  });

  it('ignores a second press of Other… within three seconds, such as a double click or a replay', () => {
    const input = call({ header: 'Color' });
    const armed = partialState(parse({ input, interaction: click({ actionId: id('custom') }) }));

    expect(
      parse({
        input,
        interaction: click({ actionId: id('custom'), at: armedAt + 2000 }),
        state: armed,
      }),
    ).toEqual({ kind: 'ignore' });
  });

  it('restores picks on other pages when Other… is cancelled', () => {
    const input = call({ header: 'Pick', multiple: true, options: options(400) });
    const state = { page: 1, picks: { U1: { 0: [3], 15: [399] } } };

    const armed = partialState(
      parse({ input, interaction: click({ actionId: id('custom') }), state }),
    );
    const disarmed = partialState(
      parse({
        input,
        interaction: click({ actionId: id('custom'), at: armedAt + 5000 }),
        state: armed,
      }),
    );

    expect(disarmed.picks).toEqual({ U1: { 0: [3] } });
    expect(
      parse({ input, interaction: click({ actionId: id('submit') }), state: disarmed }),
    ).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Pick', selected: ['Option 3'] }] },
    });
  });

  it('does not let a bystander cancel or reuse another participant’s arm', () => {
    const input = call({ header: 'Colors', multiple: true });
    const one = partialState(parse({ input, interaction: click({ actionId: id('custom') }) }));
    const two = partialState(
      parse({ input, interaction: click({ actionId: id('custom'), user: 'U2' }), state: one }),
    );
    const three = partialState(
      parse({
        input,
        interaction: click({ actionId: id('custom'), at: armedAt + 5000, user: 'U2' }),
        state: two,
      }),
    );

    expect(Object.keys(three.armed)).toEqual(['U1']);
    expect(
      parse({ input, interaction: reply({ text: 'mine', user: 'U2' }), state: three }),
    ).toEqual({
      kind: 'ignore',
    });
  });

  it('ignores Other… from an interaction without a snowflake id', () => {
    const interaction = click({ actionId: id('custom') });

    (interaction as { event: { raw: unknown } }).event.raw = {};

    expect(parse({ input: call({ header: 'Color' }), interaction })).toEqual({ kind: 'ignore' });
  });

  it('keeps each participant’s arm independent', () => {
    const input = call({ header: 'Color' });

    const one = partialState(parse({ input, interaction: click({ actionId: id('custom') }) }));
    const two = partialState(
      parse({ input, interaction: click({ actionId: id('custom'), user: 'U2' }), state: one }),
    );

    expect(Object.keys(two.armed)).toEqual(['U1', 'U2']);
  });

  it('ignores Other… when typed answers are not allowed', () => {
    const input = call({ header: 'Color', custom: false });

    expect(parse({ input, interaction: click({ actionId: id('custom') }) })).toEqual({
      kind: 'ignore',
    });
  });

  it('answers with the armed participant’s reply inside the window', () => {
    const input = call({ header: 'Color' });
    const state = { armed: { U1: { at: armedAt, picks: [] } } };

    expect(
      parse({
        input,
        interaction: reply({ at: armedAt + ARM_WINDOW_MS - 1000, text: `<@${BOT_ID}> Teal` }),
        state,
      }),
    ).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Color', selected: [], custom: 'Teal' }] },
    });
    expect(
      parse({
        input,
        interaction: reply({ at: armedAt + ARM_WINDOW_MS + 1000, text: 'Teal' }),
        state,
      }),
    ).toEqual({
      kind: 'ignore',
    });
  });

  it('combines kept picks with a typed answer for a multi-select question', () => {
    const input = call({ header: 'Colors', multiple: true });
    const state = { armed: { U1: { at: armedAt, picks: [2] } }, picks: { U1: { 0: [0] } } };

    expect(parse({ input, interaction: reply({ text: 'and teal' }), state })).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Colors', selected: ['Red', 'Green'], custom: 'and teal' }] },
    });
  });

  it('ignores replies from anyone who did not press Other…, and replies sent before it', () => {
    const input = call({ header: 'Color' });
    const state = { armed: { U1: { at: armedAt, picks: [] } } };

    expect(parse({ input, interaction: reply({ text: 'Teal', user: 'U2' }), state })).toEqual({
      kind: 'ignore',
    });
    expect(
      parse({ input, interaction: reply({ at: armedAt - 1000, text: 'Teal' }), state }),
    ).toEqual({
      kind: 'ignore',
    });
    expect(parse({ input, interaction: reply({ text: 'Teal' }) })).toEqual({ kind: 'ignore' });
  });

  it('keeps a leading mention of a teammate in a typed answer', () => {
    const state = { armed: { U1: { at: armedAt, picks: [] } } };
    const text = `<@${TEAMMATE_ID}> should own it`;

    expect(
      parse({ input: call({ header: 'Owner' }), interaction: reply({ text }), state }),
    ).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Owner', selected: [], custom: text }] },
    });
  });

  it('ignores a reply without a valid sent time', () => {
    const state = { armed: { U1: { at: armedAt, picks: [] } } };
    const interaction = reply({ text: 'Teal' });

    (interaction as { message: { metadata: { dateSent: unknown } } }).message.metadata.dateSent =
      'garbage';

    expect(parse({ input: call({ header: 'Color' }), interaction, state })).toEqual({
      kind: 'ignore',
    });
  });

  it('rejects an empty armed reply', () => {
    const state = { armed: { U1: { at: armedAt, picks: [] } } };

    expect(
      parse({
        input: call({ header: 'Color' }),
        interaction: reply({ text: `<@${BOT_ID}>  ` }),
        state,
      }),
    ).toEqual({
      kind: 'rejected',
      reason: 'Type your answer as a message in this thread.',
    });
  });

  it('lets a late reply through as an ordinary message once the question is settled', () => {
    const state = { armed: { U1: { at: armedAt, picks: [] } } };

    expect(
      parse({
        input: call({ header: 'Color' }),
        interaction: reply({ text: 'Teal' }),
        settled: true,
        state,
      }),
    ).toEqual({ kind: 'ignore' });
  });

  it('drops expired arms on the next click', () => {
    const input = call({ header: 'Colors', multiple: true });
    const state = { armed: { U2: { at: armedAt - ARM_WINDOW_MS - 1, picks: [] } } };

    const next = partialState(
      parse({ input, interaction: click({ actionId: id('select', 0), values: ['1'] }), state }),
    );

    expect(next.armed).toEqual({});
  });

  it('ignores an option button forged onto a menu, and malformed menu values', () => {
    const plans = call({
      header: 'Plan',
      options: [
        { label: 'Basic', description: 'Monthly' },
        { label: 'Pro', description: 'Yearly' },
      ],
    });
    const many = call({ header: 'Pick', options: options(30) });

    expect(parse({ input: plans, interaction: click({ actionId: id('option', 0) }) })).toEqual({
      kind: 'ignore',
    });
    expect(
      parse({ input: many, interaction: click({ actionId: id('select', 0), values: ['1', '2'] }) }),
    ).toEqual({ kind: 'ignore' });
    expect(
      parse({ input: many, interaction: click({ actionId: id('select', 0), values: [] }) }),
    ).toEqual({ kind: 'ignore' });
    expect(parse({ input: many, interaction: click({ actionId: id('select', 0) }) })).toEqual({
      kind: 'ignore',
    });
  });

  it('ignores Submit on a single-choice question and a question beyond the set', () => {
    const input = call({ header: 'Color' });

    expect(parse({ input, interaction: click({ actionId: id('submit') }) })).toEqual({
      kind: 'ignore',
    });
    expect(
      parse({
        input,
        interaction: click({ actionId: id('dismiss', undefined, 5) }),
        state: { q: 5 },
      }),
    ).toEqual({ kind: 'ignore' });
  });

  it('collapses duplicate menu values into one pick', () => {
    const input = call({ header: 'Colors', multiple: true });
    const state = partialState(
      parse({ input, interaction: click({ actionId: id('select', 0), values: ['1', '1', '1'] }) }),
    );

    expect(state.picks).toEqual({ U1: { 0: [1] } });
  });

  it('ignores modal submissions', () => {
    const interaction = { type: 'modalSubmit', event: {} } as unknown as QuestionInteraction;

    expect(parse({ input: call({ header: 'Color' }), interaction })).toEqual({ kind: 'ignore' });
  });

  it('is pure: the same input gives the same result whatever the clock says', () => {
    const input = call({ header: 'Color' });
    const state = { armed: { U1: { at: armedAt, picks: [] } } };
    const interaction = reply({ text: 'Teal' });

    vi.useFakeTimers();
    vi.setSystemTime(0);

    const early = parse({ input, interaction, state });

    vi.setSystemTime(Date.UTC(2100, 0, 1));

    const late = parse({ input, interaction, state });

    vi.useRealTimers();

    expect(early).toEqual(late);
    expect(early.kind).toBe('answer');
  });
});
