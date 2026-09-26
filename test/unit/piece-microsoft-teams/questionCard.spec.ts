import { describe, expect, it, vi } from 'vitest';

import type { ChannelQuestionCall } from '../../../packages/frogbot/src/channels/questions/types.js';
import type { QuestionInput } from '../../../packages/frogbot/src/tools/question.js';
import {
  CARD_BUDGET,
  cardSize,
  closedCard,
  DISMISS_ACTION_ID,
  overflowCard,
  questionCard,
  settledCard,
  SUBMIT_ACTION_ID,
  TeamsQuestionCardTooLarge,
} from '../../../packages/pieces/piece-microsoft-teams/src/questions/card.js';
import { textRuns } from '../frogbot/channels/teamsFixtures.js';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

type Item = QuestionInput['questions'][number];

function questionCall(...questions: Array<Partial<Item>>): ChannelQuestionCall {
  return {
    toolCallId: 'call-1',
    toolName: 'question',
    messageId: 'assistant-1',
    chatId: 'chat-1',
    agentSlug: 'support',
    createdAt: '2026-09-25T00:00:00.000Z',
    input: {
      questions: questions.map((item, index) => ({
        header: `Question ${index + 1}`,
        question: `Pick ${index + 1}?`,
        options: [{ label: 'Red' }, { label: 'Blue' }],
        custom: true,
        ...item,
      })),
    },
  };
}

function options(count: number, description?: (index: number) => string) {
  return Array.from({ length: count }, (_, index) => ({
    label: `Option ${index + 1}`,
    ...(description ? { description: description(index) } : {}),
  }));
}

function choiceSets(card: ReturnType<typeof questionCard>) {
  return card.body.filter(({ type }) => type === 'Input.ChoiceSet');
}

describe('Teams question card', () => {
  it('renders one Adaptive Card 1.5 with a radio list, a typed answer, Submit, and Dismiss', () => {
    const card = questionCard({
      call: questionCall({ header: 'Color', question: 'Which color should the fence be?' }),
    });

    expect(card).toEqual({
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.5',
      fallbackText: 'Color: Which color should the fence be?',
      body: [
        { type: 'RichTextBlock', inlines: [{ type: 'TextRun', text: 'Color', weight: 'Bolder' }] },
        {
          type: 'Input.ChoiceSet',
          id: 'question-0',
          label: 'Which color should the fence be?',
          style: 'expanded',
          isMultiSelect: false,
          wrap: true,
          choices: [
            { title: 'Red', value: '0' },
            { title: 'Blue', value: '1' },
          ],
        },
        {
          type: 'Input.Text',
          id: 'question-0-text',
          label: 'Or type your own answer',
          isMultiline: true,
          maxLength: 2000,
        },
      ],
      actions: [
        {
          type: 'Action.Submit',
          title: 'Submit',
          style: 'positive',
          data: { actionId: SUBMIT_ACTION_ID, value: 'call-1' },
        },
        {
          type: 'Action.Submit',
          title: 'Dismiss',
          style: 'destructive',
          associatedInputs: 'none',
          data: { actionId: DISMISS_ACTION_ID, value: 'call-1' },
        },
      ],
    });
  });

  it('uses a multi-select list when several choices are allowed', () => {
    const [choices] = choiceSets(questionCard({ call: questionCall({ multiple: true }) }));

    expect(choices).toMatchObject({ style: 'expanded', isMultiSelect: true });
  });

  it('requires a choice and omits the text box when typed answers are off', () => {
    const card = questionCard({ call: questionCall({ custom: false }) });

    expect(card.body.map(({ type }) => type)).toEqual(['RichTextBlock', 'Input.ChoiceSet']);
    expect(choiceSets(card)[0]).toMatchObject({
      isRequired: true,
      errorMessage: 'Choose an answer for “Question 1”.',
    });
  });

  it('switches to a dropdown above ten options and keeps every option', () => {
    const [ten] = choiceSets(questionCard({ call: questionCall({ options: options(10) }) }));
    const [eleven] = choiceSets(questionCard({ call: questionCall({ options: options(11) }) }));

    expect(ten).toMatchObject({ style: 'expanded' });
    expect(ten).not.toHaveProperty('placeholder');
    expect(eleven).toMatchObject({ style: 'compact', placeholder: 'Choose an option' });
    expect(eleven!.choices).toHaveLength(11);
  });

  it('keeps several questions on one card, separated, with one pair of buttons', () => {
    const card = questionCard({
      call: questionCall(
        { header: 'Color' },
        { header: 'Size', options: [{ label: 'S' }, { label: 'L' }], custom: false },
      ),
    });

    expect(choiceSets(card).map(({ id }) => id)).toEqual(['question-0', 'question-1']);
    expect(card.body.filter(({ separator }) => separator)).toEqual([
      {
        type: 'RichTextBlock',
        inlines: [{ type: 'TextRun', text: 'Size', weight: 'Bolder' }],
        separator: true,
        spacing: 'Medium',
      },
    ]);
    expect(card.actions).toHaveLength(2);
    expect(card.fallbackText).toBe('Color: Pick 1?\nSize: Pick 2?');
  });

  it('shows labels exactly, including commas, with index values', () => {
    const labels = ['Red, dark', 'Blue “navy”', '  Green  ', 'Ünïcode — ok', '0'];
    const [choices] = choiceSets(
      questionCard({ call: questionCall({ options: labels.map((label) => ({ label })) }) }),
    );

    expect(choices!.choices).toEqual(
      labels.map((title, index) => ({ title, value: String(index) })),
    );
  });

  it('adds option descriptions to the choice titles', () => {
    const [choices] = choiceSets(
      questionCard({
        call: questionCall({ options: [{ label: 'Red', description: 'Warm' }, { label: 'Blue' }] }),
      }),
    );

    expect(choices!.choices).toEqual([
      { title: 'Red — Warm', value: '0' },
      { title: 'Blue', value: '1' },
    ]);
  });

  it('shows a rejection above the buttons and keeps the submitted values', () => {
    const card = questionCard({
      call: questionCall({ multiple: true }),
      error: 'Answer “Question 1” before submitting.',
      values: { 'question-0': '0,1', 'question-0-text': 'Teal' },
    });

    expect(choiceSets(card)[0]).toMatchObject({ value: '0,1' });
    expect(card.body.find(({ id }) => id === 'question-0-text')).toMatchObject({ value: 'Teal' });
    expect(card.body.at(-1)).toEqual({
      type: 'RichTextBlock',
      inlines: [
        { type: 'TextRun', text: 'Answer “Question 1” before submitting.', color: 'Attention' },
      ],
      spacing: 'Medium',
    });
  });

  it('fits 400 described options under the budget with every option and its index', () => {
    const call = questionCall({
      options: options(400, (index) => `Description ${index} `.repeat(12)),
      multiple: true,
    });

    const card = questionCard({ call });
    const [choices] = choiceSets(card);

    expect(cardSize(card)).toBeLessThanOrEqual(CARD_BUDGET);
    expect(choices).toMatchObject({ style: 'compact', isMultiSelect: true });
    expect(choices!.choices).toHaveLength(400);
    expect(
      (choices!.choices as Array<{ title: string; value: string }>).every(
        ({ title, value }, index) =>
          value === String(index) && title.startsWith(`Option ${index + 1}`),
      ),
    ).toBe(true);
  });

  it('keeps full descriptions while the card fits', () => {
    const long = 'x'.repeat(300);
    const [choices] = choiceSets(
      questionCard({ call: questionCall({ options: options(60, () => long) }) }),
    );

    expect((choices!.choices as Array<{ title: string }>)[0]!.title).toBe(`Option 1 — ${long}`);
  });

  it('shortens descriptions before titles when the card is too large', () => {
    const long = 'x'.repeat(300);
    const [choices] = choiceSets(
      questionCard({ call: questionCall({ options: options(100, () => long) }) }),
    );

    expect((choices!.choices as Array<{ title: string }>)[99]!.title).toBe(
      `Option 100 — ${'x'.repeat(119)}…`,
    );
  });

  it('shortens choice titles for display only as the last step', () => {
    const call = questionCall({
      options: Array.from({ length: 150 }, (_, index) => ({
        label: `${index}-${'y'.repeat(200)}`,
      })),
    });

    const [choices] = choiceSets(questionCard({ call }));
    const titles = choices!.choices as Array<{ title: string; value: string }>;

    expect(titles).toHaveLength(150);
    expect(titles[149]).toEqual({ title: `149-${'y'.repeat(75)}…`, value: '149' });
  });

  it('refuses a card that cannot fit without dropping an option', () => {
    const call = questionCall({ options: options(2000) });

    expect(() => questionCard({ call })).toThrow(TeamsQuestionCardTooLarge);
  });

  it('shortens a very long question on screen so the card still fits', () => {
    const question = `Which one? ${'z'.repeat(30_000)}`;
    const card = questionCard({ call: questionCall({ question }) });

    expect(cardSize(card)).toBeLessThanOrEqual(CARD_BUDGET);
    expect(String(choiceSets(card)[0]!.label)).toHaveLength(500);
    expect(card.fallbackText).toHaveLength('Question 1: '.length + 200);
  });

  it('drops the prefilled values before refusing a redrawn card', () => {
    const call = questionCall({ options: options(620), custom: true });
    const values = { 'question-0': '1', 'question-0-text': 't'.repeat(2000) };

    expect(cardSize(questionCard({ call }))).toBeLessThanOrEqual(CARD_BUDGET);

    const card = questionCard({ call, error: 'Answer “Question 1” before submitting.', values });

    expect(cardSize(card)).toBeLessThanOrEqual(CARD_BUDGET);
    expect(card.body.find(({ id }) => id === 'question-0-text')).not.toHaveProperty('value');
  });

  it('keeps a settled card under the budget when every long option was chosen', () => {
    const labels = Array.from({ length: 150 }, (_, index) => `${index} ${'w'.repeat(200)}`);
    const call = questionCall({ multiple: true, options: labels.map((label) => ({ label })) });

    const card = settledCard({
      call,
      outcome: {
        output: {
          answers: [{ header: 'Question 1', selected: labels, custom: 'c'.repeat(50_000) }],
        },
      },
      by: 'Grace Hopper',
    });

    expect(cardSize(card)).toBeLessThanOrEqual(CARD_BUDGET);
    expect(textRuns(card.body).at(-1)).toMatchObject({ text: 'Answered by Grace Hopper' });
    expect(
      String(textRuns(card.body).find(({ text }) => String(text).startsWith('✅'))!.text),
    ).toMatch(/^✅ 0 w+.*…$/);
  });

  it('closes a card without inputs when its question is no longer open', () => {
    const card = closedCard({ call: questionCall({ header: 'Color' }, { header: 'Size' }) });

    expect(card).not.toHaveProperty('actions');
    expect(textRuns(card.body).map(({ text }) => text)).toEqual([
      'Color',
      'Size',
      'This question is no longer open.',
    ]);
  });

  it('offers only Dismiss on a card too large to show its choices', () => {
    const card = overflowCard({ call: questionCall({ header: 'Color', options: options(2000) }) });

    expect(card.body.some(({ type }) => String(type).startsWith('Input.'))).toBe(false);
    expect(card.actions).toEqual([
      expect.objectContaining({ data: { actionId: DISMISS_ACTION_ID, value: 'call-1' } }),
    ]);
    expect(cardSize(card)).toBeLessThanOrEqual(CARD_BUDGET);
  });

  it('settles to a read-only card with the answers and the responder', () => {
    const card = settledCard({
      call: questionCall({ header: 'Color' }, { header: 'Size', multiple: true }),
      outcome: {
        output: {
          answers: [
            { header: 'Color', selected: [], custom: 'Teal' },
            { header: 'Size', selected: ['Red', 'Blue'] },
          ],
        },
      },
      by: 'Grace Hopper',
    });

    expect(card).not.toHaveProperty('actions');
    expect(card.body.some(({ type }) => String(type).startsWith('Input.'))).toBe(false);
    expect(textRuns(card.body).map(({ text }) => text)).toEqual([
      'Color',
      'Pick 1?',
      '✅ “Teal”',
      'Size',
      'Pick 2?',
      '✅ Red, Blue',
      'Answered by Grace Hopper',
    ]);
  });

  it('shows model and participant text literally, never as markdown', () => {
    const call = questionCall({ header: '**Color**', question: 'Pick [one](https://example.com)' });

    const cards = [
      questionCard({ call, error: 'Answer “**Color**” before submitting.' }),
      settledCard({
        call,
        outcome: {
          output: {
            answers: [{ header: '**Color**', selected: [], custom: '[Click](https://x.test)' }],
          },
        },
        by: '_Mallory_',
      }),
    ];

    expect(cards.flatMap(({ body }) => body.map(({ type }) => type))).not.toContain('TextBlock');
    expect(textRuns(cards[1]!.body).map(({ text }) => text)).toEqual([
      '**Color**',
      'Pick [one](https://example.com)',
      '✅ “[Click](https://x.test)”',
      'Answered by _Mallory_',
    ]);
  });

  it('settles a dismissal without a responder when none is known', () => {
    const card = settledCard({
      call: questionCall({ header: 'Color' }),
      outcome: { dismissed: true },
    });

    expect(textRuns(card.body).map(({ text }) => text)).toEqual(['Color', 'Pick 1?', 'Dismissed']);
    expect(textRuns(card.body).at(-1)).toMatchObject({ color: 'Attention', weight: 'Bolder' });
  });
});
