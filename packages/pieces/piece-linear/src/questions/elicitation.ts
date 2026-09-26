import { AgentActivitySignal, AgentActivityType } from '@linear/sdk';
import type { ChannelQuestionCall, QuestionInput } from 'frogbot/pieces';

import type { LinearActivity } from './linearThread.js';

export const SELECT_OPTIONS = 25;

type QuestionItem = QuestionInput['questions'][number];

export function isSelectQuestion(input: QuestionInput): boolean {
  const [item] = input.questions;

  return input.questions.length === 1 && !item!.multiple && item!.options.length <= SELECT_OPTIONS;
}

export function elicitation({
  call,
  notice,
}: {
  call: ChannelQuestionCall;
  notice?: string;
}): LinearActivity {
  const { input } = call;
  const select = isSelectQuestion(input);
  const sections = select ? selectSections(input.questions[0]!) : listSections(input);
  const body = [...(notice ? [`> ${notice}`] : []), ...sections].join('\n\n');

  if (!select) return { content: { type: AgentActivityType.Elicitation, body } };

  return {
    content: { type: AgentActivityType.Elicitation, body },
    signal: AgentActivitySignal.Select,
    signalMetadata: {
      options: input.questions[0]!.options.map(({ label }) => ({ label, value: label })),
    },
  };
}

export function response(body: string): LinearActivity {
  return { content: { type: AgentActivityType.Response, body } };
}

export function replyHint({ item, numbered }: { item: QuestionItem; numbered: boolean }): string {
  const header = `“${escapeMarkdown(item.header)}”`;

  if (item.custom) return `Reply to ${header} with an option or your own answer.`;

  if (item.multiple) return `Reply to ${header} with option numbers or labels, such as \`1, 3\`.`;

  return numbered
    ? `Reply to ${header} with one option number or label.`
    : `Reply to ${header} with one of the options.`;
}

export function escapeMarkdown(text: string): string {
  return text
    .replace(/[\\`*_[\]<>#|~]/g, '\\$&')
    .replace(/^[-+]/, '\\$&')
    .replace(/^(\d+)([.)])/, '$1\\$2');
}

function selectSections(item: QuestionItem): string[] {
  const options = item.options.map(
    ({ label, description }) =>
      `- **${escapeMarkdown(label)}**${description ? ` — ${description}` : ''}`,
  );

  return [
    prompt(item),
    options.join('\n'),
    item.custom ? 'Choose an option, or reply with your own answer.' : 'Choose one of the options.',
  ];
}

function listSections(input: QuestionInput): string[] {
  const questions = input.questions.map((item) =>
    [
      prompt(item),
      item.options
        .map(
          ({ label, description }, index) =>
            `${index + 1}. ${escapeMarkdown(label)}${description ? ` — ${description}` : ''}`,
        )
        .join('\n'),
      `_${optionsHint(item)}_`,
    ].join('\n\n'),
  );

  return input.questions.length > 1
    ? [...questions, 'Reply with one line per question, in the order shown.']
    : questions;
}

function optionsHint(item: QuestionItem): string {
  const choose = item.multiple
    ? 'Choose one or more: reply with option numbers or labels, separated by commas (`1, 3`)'
    : 'Choose one: reply with an option number or label';

  return item.custom ? `${choose}, or type your own answer.` : `${choose}.`;
}

function prompt({ header, question }: QuestionItem): string {
  return `**${escapeMarkdown(header)}**\n${question}`;
}
