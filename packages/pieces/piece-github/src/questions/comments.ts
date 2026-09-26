import type { ChannelQuestionCall, QuestionInput, QuestionOutput } from 'frogbot/pieces';

export const GITHUB_COMMENT_LIMIT = 65_536;

const PROMPT_TEXT = 1_000;
const ANSWER_TEXT = 30_000;

type QuestionItem = QuestionInput['questions'][number];

type QuestionAnswer = QuestionOutput['answers'][number];

type QuestionOption = QuestionItem['options'][number];

type Block = { separator: string; text: string };

export function questionPages({
  call,
  limit = GITHUB_COMMENT_LIMIT,
  q,
}: {
  call: ChannelQuestionCall;
  limit?: number;
  q: number;
}): string[] {
  const { questions } = call.input;
  const item = questions[q]!;

  const blocks: Block[] = [
    { separator: '\n\n', text: escapeBlock(item.question) },
    ...item.options.map((option, index) => ({
      separator: index === 0 ? '\n\n' : '\n',
      text: optionLine({ index, option }),
    })),
    { separator: '\n\n', text: instructions({ item, total: questions.length }) },
  ];

  return pack({
    blocks,
    first: heading({ item, q, total: questions.length }),
    limit,
    next: continuedHeading(item),
  });
}

export function answeredComment({
  answer,
  by,
  call,
  q,
}: {
  answer?: QuestionAnswer;
  by?: string;
  call: ChannelQuestionCall;
  q: number;
}): string {
  const values = answer
    ? [...answer.selected, ...(answer.custom ? [`“${answer.custom}”`] : [])].join(', ')
    : '';

  const result = answer ? `✅ **${escapeInline(clip(values, ANSWER_TEXT))}**` : '🚫 **Dismissed**';
  const verb = answer ? 'Answered' : 'Dismissed';

  const footer = `<sub>${verb}${by ? ` by \`@${by}\`` : ''}</sub>`;

  return [closedHeading({ call, q }), result, footer].join('\n\n');
}

export function closedPageComment({ call, q }: { call: ChannelQuestionCall; q: number }): string {
  return `${continuedHeading(call.input.questions[q]!)}: this question is closed.`;
}

export function instructions({ item, total }: { item: QuestionItem; total: number }): string {
  return [
    'Reply in a new comment:',
    '- `/answer 1` to choose an option',
    ...(item.multiple && item.options.length > 1 ? ['- `/answer 1, 2` to choose several'] : []),
    ...(item.custom ? ['- `/answer "your answer"` to answer in your own words'] : []),
    `- \`/dismiss\` to decline ${total > 1 ? 'these questions' : 'this question'}`,
  ].join('\n');
}

export function escapeInline(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[\\`*_{}[\]<>|~&:]/g, '\\$&')
    .replace(/@/g, '@\u200b')
    .replace(/#(?=\d)/g, '#\u200b')
    .replace(/\b(gh)-(?=\d)/gi, '$1-\u200b');
}

export function escapeBlock(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) =>
      escapeInline(line)
        .replace(/^(\s*)([#>+\-=])/, '$1\\$2')
        .replace(/^(\s*\d+)([.)])/, '$1\\$2'),
    )
    .join('\n');
}

function heading({ item, q, total }: { item: QuestionItem; q: number; total: number }): string {
  const header = escapeInline(item.header).replaceAll('#', '\\#');

  return `### ${header}${total > 1 ? ` · Question ${q + 1} of ${total}` : ''}`;
}

function closedHeading({ call, q }: { call: ChannelQuestionCall; q: number }): string {
  const item = call.input.questions[q]!;

  return [
    heading({ item, q, total: call.input.questions.length }),
    escapeBlock(clip(item.question, PROMPT_TEXT)),
  ].join('\n\n');
}

function continuedHeading(item: QuestionItem): string {
  return `**${escapeInline(item.header)}** (continued)`;
}

function optionLine({ index, option }: { index: number; option: QuestionOption }): string {
  const description = option.description ? ` — ${escapeInline(option.description)}` : '';

  return `${index + 1}. **${escapeInline(option.label)}**${description}`;
}

function pack({
  blocks,
  first,
  limit,
  next,
}: {
  blocks: Block[];
  first: string;
  limit: number;
  next: string;
}): string[] {
  const pages: string[] = [];
  const size = limit - next.length - 2;

  let page = first;

  blocks.forEach(({ separator, text }) => {
    chunks({ size, text }).forEach((chunk, index) => {
      const addition = `${index === 0 ? separator : ''}${chunk}`;

      if (page.length + addition.length <= limit) {
        page += addition;

        return;
      }

      pages.push(page);
      page = `${next}\n\n${chunk}`;
    });
  });

  pages.push(page);

  return pages;
}

function chunks({ size, text }: { size: number; text: string }): string[] {
  const parts: string[] = [];

  let rest = text;

  while (rest.length > size) {
    let end = size;

    if (/[\uD800-\uDBFF]/.test(rest[end - 1]!)) end--;

    if (trailingBackslashes(rest.slice(0, end)) % 2 === 1) end--;

    parts.push(rest.slice(0, end));
    rest = rest.slice(end);
  }

  parts.push(rest);

  return parts;
}

function trailingBackslashes(value: string): number {
  return /\\*$/.exec(value)![0].length;
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;

  const part = value.slice(0, max - 1);

  return `${/[\uD800-\uDBFF]$/.test(part) ? part.slice(0, -1) : part}…`;
}
