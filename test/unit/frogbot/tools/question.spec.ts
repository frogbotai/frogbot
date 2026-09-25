import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  question,
  QuestionInput,
  QuestionOutput,
} from '../../../../packages/frogbot/src/tools/question.js';
import { isClientTool } from '../../../../packages/frogbot/src/tools/types.js';

const size = {
  header: 'Size',
  question: 'Which size do you want?',
  options: [{ label: 'Small' }, { label: 'Large', description: 'Fits two frogs.' }],
};

const colors = {
  header: 'Colors',
  question: 'Which colors should it come in?',
  options: [{ label: 'Green' }, { label: 'Brown' }],
  multiple: true,
};

function validate(input: unknown, output: unknown) {
  return question.client.validate!({
    input: QuestionInput.parse(input),
    output: QuestionOutput.parse(output),
  });
}

describe('question tool', () => {
  it('is answered by the client through the question component', () => {
    expect(question).toMatchObject({
      slug: 'question',
      component: '@frogbotai/ui/chat#QuestionToolRender',
      client: { kind: 'question' },
    });
    expect(question).not.toHaveProperty('execute');
  });

  describe('input', () => {
    it('allows custom answers by default', () => {
      expect(QuestionInput.parse({ questions: [size] }).questions[0]?.custom).toBe(true);
    });

    it('keeps custom answers disabled when asked to', () => {
      expect(
        QuestionInput.parse({ questions: [{ ...size, custom: false }] }).questions[0]?.custom,
      ).toBe(false);
    });

    it('accepts a header of 30 characters and rejects a longer one', () => {
      expect(
        QuestionInput.safeParse({ questions: [{ ...size, header: 'a'.repeat(30) }] }).success,
      ).toBe(true);
      expect(
        QuestionInput.safeParse({ questions: [{ ...size, header: 'a'.repeat(31) }] }).success,
      ).toBe(false);
    });

    it('rejects a question without options', () => {
      expect(QuestionInput.safeParse({ questions: [{ ...size, options: [] }] }).success).toBe(
        false,
      );
    });

    it('rejects an empty question list', () => {
      expect(QuestionInput.safeParse({ questions: [] }).success).toBe(false);
    });

    it('rejects duplicate option labels within a question', () => {
      const result = QuestionInput.safeParse({
        questions: [{ ...size, options: [{ label: 'Small' }, { label: 'Small' }] }],
      });

      expect(result.error?.issues).toEqual([
        expect.objectContaining({
          message: 'Option labels must be unique within a question.',
          path: ['questions', 0, 'options'],
        }),
      ]);
    });

    it('allows the same option label in different questions', () => {
      expect(
        QuestionInput.safeParse({
          questions: [size, { ...colors, options: [{ label: 'Small' }] }],
        }).success,
      ).toBe(true);
    });

    it('rejects duplicate question headers', () => {
      const result = QuestionInput.safeParse({ questions: [size, { ...colors, header: 'Size' }] });

      expect(result.error?.issues).toEqual([
        expect.objectContaining({
          message: 'Question headers must be unique.',
          path: ['questions'],
        }),
      ]);
    });
  });

  describe('answers', () => {
    it('accepts one offered option per single-select question', () => {
      expect(
        validate(
          { questions: [size, colors] },
          {
            answers: [
              { header: 'Size', selected: ['Large'] },
              { header: 'Colors', selected: ['Green', 'Brown'] },
            ],
          },
        ),
      ).toBe(true);
    });

    it('accepts a custom answer when custom answers are allowed', () => {
      expect(
        validate(
          { questions: [size] },
          { answers: [{ header: 'Size', selected: [], custom: 'XL' }] },
        ),
      ).toBe(true);
    });

    it('accepts an option alongside a custom answer on a multi-select question', () => {
      expect(
        validate(
          { questions: [colors] },
          { answers: [{ header: 'Colors', selected: ['Green'], custom: 'Gold' }] },
        ),
      ).toBe(true);
    });

    it.each([
      ['too few', []],
      [
        'too many',
        [
          { header: 'Size', selected: ['Small'] },
          { header: 'Size', selected: ['Large'] },
        ],
      ],
    ])('rejects %s answers', (_, answers) => {
      expect(validate({ questions: [size] }, { answers })).toBe(
        'Answer every question exactly once.',
      );
    });

    it('rejects answers out of question order', () => {
      expect(
        validate(
          { questions: [size, colors] },
          {
            answers: [
              { header: 'Colors', selected: ['Green'] },
              { header: 'Size', selected: ['Small'] },
            ],
          },
        ),
      ).toBe("Answer 1 must be for 'Size'.");
    });

    it('rejects an option that was not offered', () => {
      expect(
        validate({ questions: [size] }, { answers: [{ header: 'Size', selected: ['Medium'] }] }),
      ).toBe("'Size' has an answer that was not offered.");
    });

    it('rejects selecting the same option twice', () => {
      expect(
        validate(
          { questions: [colors] },
          { answers: [{ header: 'Colors', selected: ['Green', 'Green'] }] },
        ),
      ).toBe("'Colors' selects the same option twice.");
    });

    it.each([
      ['two options', { selected: ['Small', 'Large'] }],
      ['an option and a custom answer', { selected: ['Small'], custom: 'XL' }],
    ])('rejects %s on a single-select question', (_, answer) => {
      expect(validate({ questions: [size] }, { answers: [{ header: 'Size', ...answer }] })).toBe(
        "'Size' accepts one answer.",
      );
    });

    it('rejects a custom answer when custom answers are disabled', () => {
      expect(
        validate(
          { questions: [{ ...size, custom: false }] },
          { answers: [{ header: 'Size', selected: [], custom: 'XL' }] },
        ),
      ).toBe("'Size' does not accept a custom answer.");
    });

    it('rejects an empty answer', () => {
      expect(validate({ questions: [size] }, { answers: [{ header: 'Size', selected: [] }] })).toBe(
        "Answer 'Size'.",
      );
    });

    it('rejects a blank custom answer before validation', () => {
      expect(
        QuestionOutput.safeParse({ answers: [{ header: 'Size', selected: [], custom: '  ' }] })
          .success,
      ).toBe(false);
    });
  });
});

describe('isClientTool', () => {
  it('recognizes tools answered by the client', () => {
    expect(isClientTool(question)).toBe(true);
  });

  it('rejects server tools', () => {
    expect(
      isClientTool({
        slug: 'lookup',
        description: 'Look up data',
        inputSchema: z.object({}),
        execute: () => null,
      }),
    ).toBe(false);
  });

  it('rejects a tool whose client config is undefined', () => {
    expect(
      isClientTool({
        slug: 'lookup',
        description: 'Look up data',
        inputSchema: z.object({}),
        client: undefined,
        execute: () => null,
      } as never),
    ).toBe(false);
  });
});
