import type { PieceChannelQuestions, QuestionInput, QuestionOutput } from 'frogbot/pieces';

import { isSelectQuestion, replyHint } from './elicitation.js';
import { stopRequested } from './linearThread.js';

type QuestionItem = QuestionInput['questions'][number];
type Answer = QuestionOutput['answers'][number];
type LineResult = { answer: Answer } | { reason: string };
type OptionMatch = { item: QuestionItem; numbered: boolean };

type ReplyResult =
  | { kind: 'answer'; output: QuestionOutput; explicit: boolean }
  | { kind: 'rejected'; reason: string };

const NUMBER_LIST = /^\d+(?:[\s,]+\d+)+$/;
const OPTION_NUMBER = /^(\d+)[.)]?$/;
const LIST_MARKER = /^(?:[-*+]|\d+[.)])\s+/;
const MARKDOWN_ESCAPE = /\\([!-/:-@[-`{-~])/g;

export const parseLinearQuestion: PieceChannelQuestions['parse'] = ({
  call,
  interaction,
  question,
  settled,
}) => {
  if (interaction.type !== 'message') return { kind: 'ignore' };

  if (stopRequested(interaction)) return { kind: 'dismiss' };

  const { metadata, text } = interaction.message;
  const result = parseReply({ input: call.input, text });

  const early =
    new Date(metadata.dateSent).getTime() < new Date(question.messages.at(-1)!.postedAt).getTime();

  if (settled || early) {
    return result.kind === 'answer' && result.explicit ? { kind: 'stale' } : { kind: 'ignore' };
  }

  return result.kind === 'answer' ? { kind: 'answer', output: result.output } : result;
};

function parseReply({ input, text }: { input: QuestionInput; text: string }): ReplyResult {
  const { questions } = input;
  const numbered = !isSelectQuestion(input);

  const lines =
    questions.length === 1
      ? [text.trim()]
      : text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

  if (lines.length !== questions.length) {
    return {
      kind: 'rejected',
      reason: `Answer each of the ${questions.length} questions on its own line, in the order shown.`,
    };
  }

  const results = questions.map((item, index) =>
    parseLine({ item, line: lines[index]!, numbered, unmarkCustom: questions.length > 1 }),
  );

  const failure = results.find((result): result is { reason: string } => 'reason' in result);

  if (failure) return { kind: 'rejected', reason: failure.reason };

  const answers = results.map((result) => (result as { answer: Answer }).answer);

  return {
    kind: 'answer',
    output: { answers },
    explicit: answers.every(({ custom }) => custom === undefined),
  };
}

function parseLine({
  item,
  line,
  numbered,
  unmarkCustom,
}: OptionMatch & { line: string; unmarkCustom: boolean }): LineResult {
  const unmarked = line.replace(LIST_MARKER, '');

  const selected = line
    ? (selectOptions({ item, line, numbered }) ??
      (unmarked !== line ? selectOptions({ item, line: unmarked, numbered }) : undefined))
    : undefined;

  if (selected) return { answer: { header: item.header, selected } };

  const custom = unmarkCustom ? unmarked : line;

  if (custom && item.custom) return { answer: { header: item.header, selected: [], custom } };

  return { reason: replyHint({ item, numbered }) };
}

function selectOptions({
  item,
  line,
  numbered,
}: OptionMatch & { line: string }): string[] | undefined {
  const whole = optionIndex({ item, numbered, token: line });

  if (whole !== undefined) return [item.options[whole]!.label];

  const segments = numbered && NUMBER_LIST.test(line) ? line.split(/[\s,]+/) : line.split(',');
  const indexes = matchSegments({ item, numbered, segments });

  if (!indexes?.length) return undefined;

  const unique = [...new Set(indexes)].sort((a, b) => a - b);

  if (!item.multiple && unique.length !== 1) return undefined;

  return unique.map((index) => item.options[index]!.label);
}

function matchSegments({
  item,
  numbered,
  segments,
}: OptionMatch & { segments: string[] }): number[] | undefined {
  const limit = 2 * Math.max(10, ...item.options.map(({ label }) => label.length));
  const matches: Array<number[] | undefined> = [];

  matches[segments.length] = [];

  for (let start = segments.length - 1; start >= 0; start--) {
    if (!segments[start]!.trim()) {
      matches[start] = matches[start + 1];

      continue;
    }

    for (let end = start + 1; end <= segments.length; end++) {
      const token = segments.slice(start, end).join(',').trim();

      if (token.length > limit) break;

      const rest = matches[end];
      const index = rest ? optionIndex({ item, numbered, token }) : undefined;

      if (index !== undefined) matches[start] = [index, ...rest!];
    }
  }

  return matches[0];
}

function optionIndex({
  item,
  numbered,
  token,
}: OptionMatch & { token: string }): number | undefined {
  const unescaped = token.replace(MARKDOWN_ESCAPE, '$1');

  const label =
    labelIndex({ item, text: token }) ??
    (unescaped !== token ? labelIndex({ item, text: unescaped }) : undefined);

  if (label !== undefined || !numbered) return label;

  const number = Number(OPTION_NUMBER.exec(token)?.[1] ?? 0);

  return number >= 1 && number <= item.options.length ? number - 1 : undefined;
}

function labelIndex({ item, text }: { item: QuestionItem; text: string }): number | undefined {
  const exact = item.options.findIndex(({ label }) => label === text);

  if (exact !== -1) return exact;

  const folded = item.options.flatMap(({ label }, index) =>
    label.toLowerCase() === text.toLowerCase() ? [index] : [],
  );

  return folded.length === 1 ? folded[0] : undefined;
}
