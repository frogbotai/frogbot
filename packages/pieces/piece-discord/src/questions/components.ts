import type {
  ChannelQuestionCall,
  QuestionInput,
  QuestionOutcome,
  QuestionOutput,
} from 'frogbot/pieces';

import { callKey, encodeQuestionId, type QuestionVerb } from './ids.js';
import type { DiscordQuestionState } from './state.js';

export const DISCORD_LIMITS = {
  components: 40,
  text: 4000,
  buttonsPerRow: 5,
  buttonLabel: 80,
  selectOptions: 25,
  selectsPerPage: 15,
  optionText: 100,
};

const COMPONENTS_V2_FLAG = 32768;
const STATUS_TEXT = 1000;
const PRIOR_TEXT = 1000;
const SETTLED_QUESTION_TEXT = 200;

const colors = { open: 0x5865f2, answered: 0x57f287, dismissed: 0x80848e };
const styles = { primary: 1, secondary: 2, danger: 4 };
const types = { actionRow: 1, button: 2, stringSelect: 3, textDisplay: 10, container: 17 };

type QuestionItem = QuestionInput['questions'][number];
type QuestionAnswer = QuestionOutput['answers'][number];

export type DiscordComponent = Record<string, unknown>;

export type DiscordMessageBody = {
  flags: number;
  components: DiscordComponent[];
  allowed_mentions: { parse: string[] };
};

export type QuestionResponder = { id: string; name?: string; username?: string };

export type QuestionLayout =
  { kind: 'buttons' } | { kind: 'selects'; page: number; pages: number; selects: number[] };

export function questionLayout({
  item,
  page,
}: {
  item: QuestionItem;
  page: number;
}): QuestionLayout {
  const buttons =
    !item.multiple &&
    item.options.length <= DISCORD_LIMITS.buttonsPerRow &&
    item.options.every(
      ({ description, label }) => !description && label.length <= DISCORD_LIMITS.buttonLabel,
    );

  if (buttons) return { kind: 'buttons' };

  const total = Math.ceil(item.options.length / DISCORD_LIMITS.selectOptions);
  const pages = Math.ceil(total / DISCORD_LIMITS.selectsPerPage);
  const current = Math.min(Math.max(page, 0), pages - 1);
  const first = current * DISCORD_LIMITS.selectsPerPage;
  const last = Math.min(first + DISCORD_LIMITS.selectsPerPage, total);

  const selects = Array.from({ length: last - first }, (_, index) => first + index);

  return { kind: 'selects', page: current, pages, selects };
}

export function selectRange({ item, n }: { item: QuestionItem; n: number }): [number, number] {
  const start = n * DISCORD_LIMITS.selectOptions;

  return [start, Math.min(start + DISCORD_LIMITS.selectOptions, item.options.length)];
}

export function questionPayload({
  call,
  state,
}: {
  call: ChannelQuestionCall;
  state: DiscordQuestionState;
}): DiscordMessageBody {
  const { questions } = call.input;
  const item = questions[state.q]!;
  const final = state.q === questions.length - 1;
  const layout = questionLayout({ item, page: state.page });
  const key = callKey(call.toolCallId);

  const id = (verb: QuestionVerb, n?: number) => encodeQuestionId({ key, q: state.q, verb, n });

  const controls =
    layout.kind === 'buttons'
      ? [
          row(
            item.options.map((option, index) =>
              button({ id: id('option', index), label: option.label, style: styles.primary }),
            ),
          ),
        ]
      : layout.selects.map((n) =>
          row([
            select({
              id: id('select', n),
              item,
              n,
              several: layout.selects.length > 1 || layout.pages > 1,
            }),
          ]),
        );

  const paging =
    layout.kind === 'selects' && layout.pages > 1
      ? [
          button({
            id: id('page', Math.max(layout.page - 1, 0)),
            label: layout.page > 0 ? `◀ Page ${layout.page}` : '◀',
            style: styles.secondary,
            disabled: layout.page === 0,
          }),
          button({
            id: id('page', Math.min(layout.page + 1, layout.pages - 1)),
            label: layout.page < layout.pages - 1 ? `Page ${layout.page + 2} ▶` : '▶',
            style: styles.secondary,
            disabled: layout.page === layout.pages - 1,
          }),
        ]
      : [];

  const footer = row([
    ...(item.multiple
      ? [button({ id: id('submit'), label: final ? 'Submit' : 'Next', style: styles.primary })]
      : []),
    ...paging,
    ...(item.custom
      ? [button({ id: id('custom'), label: 'Other…', style: styles.secondary })]
      : []),
    button({ id: id('dismiss'), label: 'Dismiss', style: styles.danger }),
  ]);

  const status = clip(statusLines({ item, layout, state }).join('\n'), STATUS_TEXT);

  const heading = clip(
    [
      `**${escapeMarkdown(item.header)}**${questions.length > 1 ? ` · ${state.q + 1} of ${questions.length}` : ''}`,
      ...state.answers.map(
        (answer) => `-# ✓ ${escapeMarkdown(answer.header)}: ${formatAnswer(answer)}`,
      ),
    ].join('\n'),
    PRIOR_TEXT,
  );

  const hint = item.multiple
    ? `-# Choose one or more, then press **${final ? 'Submit' : 'Next'}**.`
    : '';

  const reserved = heading.length + 1 + (hint ? hint.length + 1 : 0) + status.length;
  const title = [heading, clip(item.question, DISCORD_LIMITS.text - reserved), hint]
    .filter(Boolean)
    .join('\n');

  const list =
    layout.kind === 'selects'
      ? shortenedOptions({
          budget: DISCORD_LIMITS.text - title.length - status.length,
          item,
          layout,
        })
      : '';

  return message({
    color: colors.open,
    components: [
      text(title),
      ...(list ? [text(list)] : []),
      ...controls,
      ...(status ? [text(status)] : []),
      footer,
    ],
  });
}

export function settledPayload({
  call,
  outcome,
  responder,
}: {
  call: ChannelQuestionCall;
  outcome: QuestionOutcome;
  responder?: QuestionResponder;
}): DiscordMessageBody {
  const answers = 'output' in outcome ? outcome.output.answers : undefined;

  const lines = call.input.questions.flatMap((item, index) => {
    const answer = answers?.[index];
    const prompt = `**${escapeMarkdown(item.header)}** — ${clip(item.question, SETTLED_QUESTION_TEXT)}`;

    return answer ? [prompt, `✅ **${formatAnswer(answer)}**`] : [prompt];
  });

  if (!answers) lines.push('🚫 **Dismissed**');

  const verb = answers ? 'Answered' : 'Dismissed';
  const footer = `-# ${verb}${responder ? ` by ${responderName(responder)}` : ''}`;

  const body = clip(lines.join('\n'), DISCORD_LIMITS.text - footer.length - 1);

  return message({
    color: answers ? colors.answered : colors.dismissed,
    components: [text(`${body}\n${footer}`)],
  });
}

export function escapeMarkdown(value: string): string {
  return value.replace(/[\\*_~`|>#\-[\]()<]/g, '\\$&');
}

export function clip(value: string, max: number): string {
  if (value.length <= max) return value;

  return max <= 0 ? '' : `${head(value, max - 1)}…`;
}

export function clipMiddle(value: string, max: number): string {
  if (value.length <= max) return value;

  const start = Math.ceil((max - 1) * 0.6);

  return `${head(value, start)}…${tail(value, max - 1 - start)}`;
}

export function responderName({ id, name, username }: QuestionResponder): string {
  if (!name && !username) return `<@${id}>`;

  const handle = username && username !== name ? `@${escapeMarkdown(username)}` : '';

  return name ? `**${escapeMarkdown(name)}**${handle ? ` (${handle})` : ''}` : handle;
}

function head(value: string, length: number): string {
  const part = value.slice(0, Math.max(length, 0));

  return /[\uD800-\uDBFF]$/.test(part) ? part.slice(0, -1) : part;
}

function tail(value: string, length: number): string {
  const part = length > 0 ? value.slice(-length) : '';

  return /^[\uDC00-\uDFFF]/.test(part) ? part.slice(1) : part;
}

function statusLines({
  item,
  layout,
  state,
}: {
  item: QuestionItem;
  layout: QuestionLayout;
  state: DiscordQuestionState;
}): string[] {
  const lines: string[] = [];

  if (layout.kind === 'selects' && layout.pages > 1) {
    const [start] = selectRange({ item, n: layout.selects[0]! });
    const [, end] = selectRange({ item, n: layout.selects.at(-1)! });
    const kept = item.multiple ? ' Picks on other pages are kept.' : '';

    lines.push(
      `-# Page ${layout.page + 1} of ${layout.pages} · options ${start + 1}–${end} of ${item.options.length}.${kept}`,
    );
  }

  Object.entries(state.armed).forEach(([id, arm]) => {
    const labels = arm.picks.map((index) => escapeMarkdown(item.options[index]?.label ?? ''));
    const keeps = labels.length > 0 ? ` Keeps ${labels.join(', ')}.` : '';

    lines.push(
      `✏️ ${responderName({ id, name: arm.name })}, reply in this thread with your answer.${keeps}`,
    );
  });

  return lines;
}

function isShortened({ description, label }: QuestionItem['options'][number]): boolean {
  return (
    label.length > DISCORD_LIMITS.optionText ||
    (description?.length ?? 0) > DISCORD_LIMITS.optionText
  );
}

function shortenedOptions({
  budget,
  item,
  layout,
}: {
  budget: number;
  item: QuestionItem;
  layout: Extract<QuestionLayout, { kind: 'selects' }>;
}): string {
  const [start] = selectRange({ item, n: layout.selects[0]! });
  const [, end] = selectRange({ item, n: layout.selects.at(-1)! });
  const title = '-# Full text of shortened options:';

  const entries = item.options
    .slice(start, end)
    .flatMap((option, offset) =>
      isShortened(option)
        ? [
            `**${start + offset + 1}.** ${escapeMarkdown(option.label)}${option.description ? ` — ${escapeMarkdown(option.description)}` : ''}`,
          ]
        : [],
    );

  const lines: string[] = [];
  let length = title.length;

  for (const entry of entries) {
    if (length + 1 + entry.length > budget) continue;

    lines.push(entry);
    length += 1 + entry.length;
  }

  return lines.length > 0 ? [title, ...lines].join('\n') : '';
}

function formatAnswer(answer: QuestionAnswer): string {
  return [
    ...answer.selected.map(escapeMarkdown),
    ...(answer.custom ? [`“${escapeMarkdown(answer.custom)}”`] : []),
  ].join(', ');
}

function message({
  color,
  components,
}: {
  color: number;
  components: DiscordComponent[];
}): DiscordMessageBody {
  return {
    flags: COMPONENTS_V2_FLAG,
    components: [{ type: types.container, accent_color: color, components }],
    allowed_mentions: { parse: [] },
  };
}

function text(content: string): DiscordComponent {
  return { type: types.textDisplay, content };
}

function row(components: DiscordComponent[]): DiscordComponent {
  return { type: types.actionRow, components };
}

function button({
  disabled,
  id,
  label,
  style,
}: {
  disabled?: boolean;
  id: string;
  label: string;
  style: number;
}): DiscordComponent {
  return {
    type: types.button,
    custom_id: id,
    label: clip(label, DISCORD_LIMITS.buttonLabel),
    style,
    ...(disabled ? { disabled } : {}),
  };
}

function select({
  id,
  item,
  n,
  several,
}: {
  id: string;
  item: QuestionItem;
  n: number;
  several: boolean;
}): DiscordComponent {
  const [start, end] = selectRange({ item, n });
  const options = item.options.slice(start, end);

  const placeholder = several
    ? `Options ${start + 1}–${end}`
    : item.multiple
      ? 'Choose one or more'
      : 'Choose an answer';

  return {
    type: types.stringSelect,
    custom_id: id,
    placeholder,
    min_values: item.multiple ? 0 : 1,
    max_values: item.multiple ? options.length : 1,
    options: options.map((option, offset) => ({
      label: isShortened(option)
        ? clipMiddle(`${start + offset + 1}. ${option.label}`, DISCORD_LIMITS.optionText)
        : option.label,
      value: String(start + offset),
      ...(option.description
        ? { description: clip(option.description, DISCORD_LIMITS.optionText) }
        : {}),
    })),
  };
}
