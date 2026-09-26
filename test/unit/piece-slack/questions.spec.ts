import { describe, expect, it, vi } from 'vitest';

import type {
  ChannelQuestionCall,
  QuestionInteraction,
} from '../../../packages/frogbot/src/exports/pieces.js';
import {
  customAnswerView,
  questionBlocks,
  settledBlocks,
} from '../../../packages/pieces/piece-slack/src/questions/blocks.js';
import { parseSlackQuestion } from '../../../packages/pieces/piece-slack/src/questions/parse.js';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

type Item = ChannelQuestionCall['input']['questions'][number];

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
        options: [{ label: 'Red' }, { label: 'Blue' }],
        custom: true,
        ...item,
      })),
    },
  };
}

function options(count: number) {
  return Array.from({ length: count }, (_, index) => ({ label: `Option ${index}` }));
}

function action(actionId: string, raw: object = {}, value?: string): QuestionInteraction {
  return {
    type: 'action',
    event: {
      actionId,
      value,
      raw: { actions: [{ action_id: actionId, value }], ...raw },
      user: { userId: 'U1' },
    },
  } as unknown as QuestionInteraction;
}

function modal(blockId: string, text: string): QuestionInteraction {
  return {
    type: 'modalSubmit',
    event: {
      raw: {
        view: {
          callback_id: 'frogbot:question:custom',
          state: { values: { [blockId]: { answer: { value: text } } } },
        },
      },
      user: { userId: 'U1' },
    },
  } as unknown as QuestionInteraction;
}

function elements(blocks: Array<Record<string, unknown>>) {
  return blocks.flatMap((block) => (block.elements as Array<Record<string, unknown>>) ?? []);
}

describe('Slack question blocks', () => {
  it.each([
    [5, 'button'],
    [10, 'radio_buttons'],
    [100, 'static_select'],
  ])('renders %i single-choice options as %s', (count, type) => {
    const blocks = questionBlocks(call({ header: 'Color', options: options(count) }));

    expect(elements(blocks)[0]).toMatchObject({ type });
  });

  it('groups more than 100 options without dropping any', () => {
    const blocks = questionBlocks(call({ header: 'Color', options: options(250) }));
    const select = elements(blocks)[0] as { option_groups: Array<{ options: unknown[] }> };

    expect(select.option_groups.map((group) => group.options.length)).toEqual([100, 100, 50]);
  });

  it('offers a typed answer only when custom answers are allowed', () => {
    const ids = (custom: boolean) =>
      elements(questionBlocks(call({ header: 'Color', custom }))).map(
        (element) => element.action_id,
      );

    expect(ids(true)).toContain('frogbot:question:custom:call-1:0');
    expect(ids(false)).not.toContain('frogbot:question:custom:call-1:0');
    expect(ids(false)).toContain('frogbot:question:dismiss:call-1');
  });

  it('renders multi-select and question sets as a form with Submit', () => {
    const blocks = questionBlocks(
      call({ header: 'Colors', multiple: true }, { header: 'Size', options: options(12) }),
    );

    expect(elements(blocks).map((element) => element.type)).toEqual([
      'checkboxes',
      'button',
      'static_select',
      'button',
      'button',
      'button',
    ]);
    expect(elements(blocks).at(-2)).toMatchObject({ action_id: 'frogbot:question:submit:call-1' });
  });

  it('escapes model text in mrkdwn', () => {
    const [prompt] = questionBlocks(call({ header: '<!channel>', question: 'A & B' }));

    expect(prompt).toMatchObject({ text: { text: '*&lt;!channel&gt;*\nA &amp; B' } });
  });

  it('settles with the answer and the responder', () => {
    const blocks = settledBlocks({
      actorId: 'U1',
      answers: [{ selected: ['Red'], custom: 'Crimson' }],
      call: call({ header: 'Color', multiple: true }),
    });

    expect(JSON.stringify(blocks)).toContain('*Red, “Crimson”*');
    expect(blocks.at(-1)).toMatchObject({ elements: [{ text: 'Answered by <@U1>' }] });
  });

  it('opens a required modal for a single question and an optional one in a form', () => {
    const view = (question: ChannelQuestionCall) =>
      customAnswerView({ call: question, metadata: 'locator', q: 0 }) as {
        blocks: Array<{ optional?: boolean }>;
        private_metadata: string;
      };

    expect(view(call({ header: 'Color' })).blocks[1]!.optional).toBe(false);
    expect(view(call({ header: 'Color', multiple: true })).blocks[1]!.optional).toBe(true);
    expect(view(call({ header: 'Color' })).private_metadata).toBe('{"m":"locator"}');
  });
});

describe('Slack question parsing', () => {
  const quick = call({ header: 'Color' });

  it('maps a button index back to the exact option label', () => {
    const long = 'L'.repeat(120);
    const question = call({ header: 'Color', options: [{ label: 'Red' }, { label: long }] });

    expect(
      parseSlackQuestion({
        call: question,
        interaction: action('frogbot:question:choose:call-1:0:1', {}, '1'),
        settled: false,
      }),
    ).toEqual({ kind: 'answer', output: { answers: [{ header: 'Color', selected: [long] }] } });
  });

  it('reads a radio or select choice from the selected option', () => {
    const interaction = action('frogbot:question:choose:call-1:0', {
      actions: [{ action_id: 'frogbot:question:choose:call-1:0', selected_option: { value: '0' } }],
    });

    expect(parseSlackQuestion({ call: quick, interaction, settled: false })).toMatchObject({
      kind: 'answer',
      output: { answers: [{ selected: ['Red'] }] },
    });
  });

  it.each([
    ['frogbot:question:dismiss:call-1', { kind: 'dismiss' }],
    ['frogbot:question:custom:call-1:0', { kind: 'partial' }],
    ['frogbot:question:dismiss:call-2', { kind: 'ignore' }],
    ['input:other', { kind: 'ignore' }],
  ])('parses %s', (actionId, expected) => {
    expect(
      parseSlackQuestion({ call: quick, interaction: action(actionId), settled: false }),
    ).toEqual(expected);
  });

  it('ignores checkbox ticks in a form', () => {
    const form = call({ header: 'Colors', multiple: true });

    expect(
      parseSlackQuestion({
        call: form,
        interaction: action('frogbot:question:choose:call-1:0'),
        settled: false,
      }),
    ).toEqual({ kind: 'ignore' });
  });

  it('submits every form answer from state values and the submitter’s typed answers', () => {
    const form = call({ header: 'Colors', multiple: true }, { header: 'Size' });
    const interaction = action('frogbot:question:submit:call-1', {
      state: {
        values: {
          'frogbot:question:call-1:0': {
            'frogbot:question:choose:call-1:0': {
              selected_options: [{ value: '0' }, { value: '1' }],
            },
          },
          'frogbot:question:call-1:1': {
            'frogbot:question:choose:call-1:1': { selected_option: { value: '0' } },
          },
        },
      },
    });

    const result = parseSlackQuestion({
      call: form,
      interaction,
      settled: false,
      state: { custom: { U1: { 1: 'Huge' }, U2: { 0: 'Green' } } },
    });

    expect(result).toEqual({
      kind: 'answer',
      output: {
        answers: [
          { header: 'Colors', selected: ['Red', 'Blue'] },
          { header: 'Size', selected: [], custom: 'Huge' },
        ],
      },
    });
  });

  it('rejects a form submission with an unanswered question', () => {
    const form = call({ header: 'Colors', multiple: true }, { header: 'Size' });
    const interaction = action('frogbot:question:submit:call-1', { state: { values: {} } });

    expect(parseSlackQuestion({ call: form, interaction, settled: false })).toEqual({
      kind: 'rejected',
      reason: 'Answer “Colors” before submitting.',
    });
  });

  it('answers a single question from its custom answer modal', () => {
    expect(
      parseSlackQuestion({
        call: quick,
        interaction: modal('frogbot:question:custom:call-1:0', '  Green  '),
        settled: false,
      }),
    ).toEqual({
      kind: 'answer',
      output: { answers: [{ header: 'Color', selected: [], custom: 'Green' }] },
    });
  });

  it('saves and clears a typed answer per user in a form', () => {
    const form = call({ header: 'Colors', multiple: true }, { header: 'Size' });
    const state = { custom: { U1: { 0: 'Green' }, U2: { 1: 'Tiny' } } };

    expect(
      parseSlackQuestion({
        call: form,
        interaction: modal('frogbot:question:custom:call-1:1', 'Huge'),
        settled: false,
        state,
      }),
    ).toEqual({
      kind: 'partial',
      state: { custom: { U1: { 0: 'Green', 1: 'Huge' }, U2: { 1: 'Tiny' } } },
    });
    expect(
      parseSlackQuestion({
        call: form,
        interaction: modal('frogbot:question:custom:call-1:0', ' '),
        settled: false,
        state,
      }),
    ).toEqual({ kind: 'partial', state: { custom: { U1: {}, U2: { 1: 'Tiny' } } } });
  });

  it('ignores thread replies', () => {
    expect(
      parseSlackQuestion({
        call: quick,
        interaction: { type: 'message', message: {} } as QuestionInteraction,
        settled: false,
      }),
    ).toEqual({ kind: 'ignore' });
  });
});
