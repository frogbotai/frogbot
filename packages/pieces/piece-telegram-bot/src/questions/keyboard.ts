import type { ChannelQuestionCall, QuestionInput } from 'frogbot/pieces';

import type { TelegramQuestionAnswer, TelegramQuestionState } from './state.js';

export const OPTIONS_PER_PAGE = 10;
export const TEXT_BUDGET = 3500;

const OPTION_BUDGET = 1800;
const QUESTION_LIMIT = 1500;
const SETTLED_QUESTION_LIMIT = 300;
const ANSWER_LIMIT = 300;
const SELECTED_LIMIT = 1000;
const LABEL_LIMIT = 256;
const DESCRIPTION_LIMIT = 512;
const BUTTON_LIMIT = 48;
const PAIRED_BUTTON_LIMIT = 20;

type QuestionItem = QuestionInput['questions'][number];
type QuestionOption = QuestionItem['options'][number];

type Line = { plain: string; html: string };

export type TelegramButton = { text: string; callback_data: string };

export type TelegramMessageBody = {
  text: string;
  parse_mode: 'HTML';
  link_preview_options: { is_disabled: true };
  reply_markup: { inline_keyboard: TelegramButton[][] };
};

export type TelegramQuestionAction =
  | { kind: 'choose' | 'toggle'; q: number; index: number }
  | { kind: 'page'; q: number; page: number }
  | { kind: 'done' | 'type' | 'back'; q: number }
  | { kind: 'dismiss' };

export const actionIds = {
  choose: (q: number, index: number) => `q:${q}:o:${index}`,
  toggle: (q: number, index: number) => `q:${q}:t:${index}`,
  page: (q: number, page: number) => `q:${q}:p:${page}`,
  done: (q: number) => `q:${q}:d`,
  type: (q: number) => `q:${q}:c`,
  back: (q: number) => `q:${q}:b`,
  dismiss: 'q:x',
};

const ACTION_PATTERN = /^q:(\d{1,4}):(?:([otp]):(\d{1,6})|([dcb]))$/;

const INDEXED_KINDS = { o: 'choose', t: 'toggle' } as const;
const PLAIN_KINDS = { d: 'done', c: 'type', b: 'back' } as const;

export function decodeAction(data: string | undefined): TelegramQuestionAction | undefined {
  if (data === actionIds.dismiss) return { kind: 'dismiss' };

  const match = data?.match(ACTION_PATTERN);

  if (!match) return undefined;

  const [, q, indexed, value, plain] = match;

  if (plain) return { kind: PLAIN_KINDS[plain as keyof typeof PLAIN_KINDS], q: Number(q) };

  if (indexed === 'p') return { kind: 'page', q: Number(q), page: Number(value) };

  return {
    kind: INDEXED_KINDS[indexed as keyof typeof INDEXED_KINDS],
    q: Number(q),
    index: Number(value),
  };
}

export function optionPages(item: QuestionItem): number[][] {
  const pages: number[][] = [];

  let page: number[] = [];
  let used = 0;

  item.options.forEach((option, index) => {
    const size = (optionLine(option)?.plain.length ?? 0) + 1;
    const full =
      page.length === OPTIONS_PER_PAGE || (page.length > 0 && used + size > OPTION_BUDGET);

    if (full) {
      pages.push(page);
      page = [];
      used = 0;
    }

    page.push(index);
    used += size;
  });

  pages.push(page);

  return pages;
}

export function questionMessage({
  call,
  state,
}: {
  call: ChannelQuestionCall;
  state: TelegramQuestionState;
}): TelegramMessageBody {
  const { questions } = call.input;
  const item = questions[state.q];
  const pages = optionPages(item);
  const pageIndex = Math.min(state.page, pages.length - 1);
  const page = pages[pageIndex];

  const title =
    questions.length > 1
      ? join(bold(item.header), text(` · ${state.q + 1} of ${questions.length}`))
      : bold(item.header);

  const lines = [title, text(truncate(item.question, QUESTION_LIMIT))];

  if (state.typing) {
    const selected = selectedLabels({ item, selected: state.selected });

    if (selected.length > 0) {
      lines.push(blank(), text(truncate(`Selected: ${selected.join(', ')}`, SELECTED_LIMIT)));
    }

    lines.push(blank(), italic('Reply to this message with your answer.'));

    return message(lines, [
      [button('‹ Back', actionIds.back(state.q)), button('Dismiss', actionIds.dismiss)],
    ]);
  }

  const details = page.flatMap((index) => optionLine(item.options[index]) ?? []);

  if (details.length > 0) lines.push(blank(), ...details);

  const hints = [
    ...(item.multiple ? ['Select all that apply, then tap Done.'] : []),
    ...(pages.length > 1
      ? [`Options ${page[0] + 1}–${page.at(-1)! + 1} of ${item.options.length}.`]
      : []),
  ];

  if (hints.length > 0) lines.push(blank(), italic(hints.join(' ')));

  const options = page.map((index) => {
    const label = truncate(item.options[index].label, BUTTON_LIMIT);

    if (!item.multiple) return button(label, actionIds.choose(state.q, index));

    const mark = state.selected.includes(index) ? '☑' : '☐';

    return button(`${mark} ${label}`, actionIds.toggle(state.q, index));
  });

  const paired = page.every(
    (index) => Array.from(item.options[index].label).length <= PAIRED_BUTTON_LIMIT,
  );

  const navigation = [
    ...(pageIndex > 0 ? [button('‹ Prev', actionIds.page(state.q, pageIndex - 1))] : []),
    ...(pageIndex < pages.length - 1
      ? [button('Next ›', actionIds.page(state.q, pageIndex + 1))]
      : []),
  ];

  const rows = [
    ...chunk(options, paired ? 2 : 1),
    ...(navigation.length > 0 ? [navigation] : []),
    ...(item.multiple ? [[button('Done', actionIds.done(state.q))]] : []),
    [
      ...(item.custom ? [button('Type your answer', actionIds.type(state.q))] : []),
      button('Dismiss', actionIds.dismiss),
    ],
  ];

  return message(lines, rows);
}

export function settledMessage({
  actor,
  answers,
  call,
}: {
  actor?: string;
  answers?: TelegramQuestionAnswer[];
  call: ChannelQuestionCall;
}): TelegramMessageBody {
  const blocks = call.input.questions.map((item, q) => {
    const answer = answers?.[q];

    return [
      bold(item.header),
      text(truncate(item.question, SETTLED_QUESTION_LIMIT)),
      ...(answer ? [text(`✅ ${truncate(answerText(answer), ANSWER_LIMIT)}`)] : []),
    ];
  });

  const verb = answers ? 'Answered' : '🚫 Dismissed';
  const footer = italic(actor ? `${verb} by ${actor}` : verb);

  const lines: Line[] = [];
  let used = footer.plain.length + 2;

  for (const block of blocks) {
    const size = block.reduce((total, line) => total + line.plain.length + 1, 1);

    if (used + size > TEXT_BUDGET) {
      lines.push(text('…'), blank());

      break;
    }

    lines.push(...block, blank());
    used += size;
  }

  return message([...lines, footer], []);
}

export function selectedLabels({
  item,
  selected,
}: {
  item: QuestionItem;
  selected: number[];
}): string[] {
  return [...selected]
    .sort((a, b) => a - b)
    .flatMap((index) => (item.options[index] ? [item.options[index].label] : []));
}

export function escapeHTML(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function optionLine(option: QuestionOption): Line | undefined {
  const long = Array.from(option.label).length > BUTTON_LIMIT;

  if (!option.description && !long) return undefined;

  const label = bold(truncate(option.label, LABEL_LIMIT));

  return option.description
    ? join(text('• '), label, text(` — ${truncate(option.description, DESCRIPTION_LIMIT)}`))
    : join(text('• '), label);
}

function answerText({ custom, selected }: TelegramQuestionAnswer): string {
  return [...selected, ...(custom ? [`“${custom}”`] : [])].join(', ');
}

function message(lines: Line[], rows: TelegramButton[][]): TelegramMessageBody {
  return {
    text: lines.map(({ html }) => html).join('\n'),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: rows },
  };
}

function button(label: string, data: string): TelegramButton {
  return { text: label, callback_data: data };
}

function text(value: string): Line {
  return { plain: value, html: escapeHTML(value) };
}

function bold(value: string): Line {
  return { plain: value, html: `<b>${escapeHTML(value)}</b>` };
}

function italic(value: string): Line {
  return { plain: value, html: `<i>${escapeHTML(value)}</i>` };
}

function blank(): Line {
  return text('');
}

function join(...lines: Line[]): Line {
  return {
    plain: lines.map(({ plain }) => plain).join(''),
    html: lines.map(({ html }) => html).join(''),
  };
}

function truncate(value: string, limit: number): string {
  const characters = Array.from(value);

  return characters.length > limit ? `${characters.slice(0, limit - 1).join('')}…` : value;
}

function chunk<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}
