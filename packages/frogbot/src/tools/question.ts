import { z } from 'zod';

import type { ClientTool } from './types.js';

const QuestionOption = z.object({
  label: z.string().trim().min(1).describe('Short choice shown on the button, 1-5 words.'),
  description: z.string().optional().describe('What choosing this option means.'),
});

const QuestionItem = z
  .object({
    header: z.string().trim().min(1).max(30).describe('Very short label, at most 30 characters.'),
    question: z.string().trim().min(1).describe('The complete question.'),
    options: z.array(QuestionOption).min(1).describe('The choices to offer.'),
    multiple: z.boolean().optional().describe('Allow selecting more than one option.'),
    custom: z
      .boolean()
      .default(true)
      .describe('Allow a typed answer when no option fits. Defaults to true.'),
  })
  .refine(({ options }) => new Set(options.map(({ label }) => label)).size === options.length, {
    message: 'Option labels must be unique within a question.',
    path: ['options'],
  });

export const QuestionInput = z
  .object({ questions: z.array(QuestionItem).min(1) })
  .refine(
    ({ questions }) => new Set(questions.map(({ header }) => header)).size === questions.length,
    { message: 'Question headers must be unique.', path: ['questions'] },
  );

export const QuestionOutput = z.object({
  answers: z.array(
    z.object({
      header: z.string(),
      selected: z.array(z.string()),
      custom: z.string().trim().min(1).optional(),
    }),
  ),
});

export type QuestionInput = z.output<typeof QuestionInput>;
export type QuestionOutput = z.output<typeof QuestionOutput>;

export const question: ClientTool<typeof QuestionInput, typeof QuestionOutput> = {
  component: '@frogbotai/ui/chat#QuestionToolRender',
  slug: 'question',
  description: [
    'Ask the user one or more structured questions and wait for the answer.',
    'Use it when you need a decision or missing information before continuing; do not guess.',
    'Offer clear options. Custom answers are allowed unless `custom` is false.',
    'Do not call other tools in the same step.',
  ].join(' '),
  inputSchema: QuestionInput,
  outputSchema: QuestionOutput,
  client: {
    kind: 'question',
    validate: ({ input, output }) =>
      validateAnswers(input as QuestionInput, output as QuestionOutput),
  },
};

function validateAnswers(input: QuestionInput, output: QuestionOutput): true | string {
  if (output.answers.length !== input.questions.length) {
    return 'Answer every question exactly once.';
  }

  for (const [index, item] of input.questions.entries()) {
    const answer = output.answers[index]!;
    const labels = new Set(item.options.map(({ label }) => label));

    if (answer.header !== item.header) return `Answer ${index + 1} must be for '${item.header}'.`;

    if (answer.selected.some((label) => !labels.has(label))) {
      return `'${item.header}' has an answer that was not offered.`;
    }

    if (new Set(answer.selected).size !== answer.selected.length) {
      return `'${item.header}' selects the same option twice.`;
    }

    if (!item.multiple && answer.selected.length + (answer.custom ? 1 : 0) > 1) {
      return `'${item.header}' accepts one answer.`;
    }

    if (answer.custom && !item.custom) return `'${item.header}' does not accept a custom answer.`;

    if (answer.selected.length === 0 && !answer.custom) return `Answer '${item.header}'.`;
  }

  return true;
}
