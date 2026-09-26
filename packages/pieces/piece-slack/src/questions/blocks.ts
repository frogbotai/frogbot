import type { ChannelQuestionCall, QuestionInput } from 'frogbot/pieces';

export const QUESTION_PREFIX = 'frogbot:question';
export const CUSTOM_ANSWER_CALLBACK_ID = `${QUESTION_PREFIX}:custom`;
export const CUSTOM_ANSWER_ACTION_ID = 'answer';

const BUTTON_OPTIONS = 5;
const RADIO_OPTIONS = 10;
const SELECT_OPTIONS = 100;
const OPTION_TEXT = 75;
const MODAL_TITLE = 24;

type QuestionItem = QuestionInput['questions'][number];

export type SlackBlock = Record<string, unknown>;

export const actionIds = {
  choose: (call: ChannelQuestionCall, q: number) =>
    `${QUESTION_PREFIX}:choose:${call.toolCallId}:${q}`,
  custom: (call: ChannelQuestionCall, q: number) =>
    `${QUESTION_PREFIX}:custom:${call.toolCallId}:${q}`,
  dismiss: (call: ChannelQuestionCall) => `${QUESTION_PREFIX}:dismiss:${call.toolCallId}`,
  submit: (call: ChannelQuestionCall) => `${QUESTION_PREFIX}:submit:${call.toolCallId}`,
};

export const blockIds = {
  question: (call: ChannelQuestionCall, q: number) => `${QUESTION_PREFIX}:${call.toolCallId}:${q}`,
  custom: (call: ChannelQuestionCall, q: number) =>
    `${QUESTION_PREFIX}:custom:${call.toolCallId}:${q}`,
};

export function isQuickQuestion(input: QuestionInput): boolean {
  return input.questions.length === 1 && !input.questions[0]!.multiple;
}

export function questionBlocks(call: ChannelQuestionCall): SlackBlock[] {
  return isQuickQuestion(call.input) ? quickBlocks(call) : formBlocks(call);
}

export function settledBlocks({
  actorId,
  answers,
  call,
}: {
  actorId?: string;
  answers?: Array<{ selected: string[]; custom?: string }>;
  call: ChannelQuestionCall;
}): SlackBlock[] {
  const blocks = call.input.questions.map((item, q) => {
    const answer = answers?.[q];
    const lines = [prompt(item)];

    if (answer) {
      const values = [...answer.selected, ...(answer.custom ? [`“${answer.custom}”`] : [])];

      lines.push(`:white_check_mark: *${escape(values.join(', '))}*`);
    }

    return section(lines.join('\n'));
  });

  const verb = answers ? 'Answered' : 'Dismissed';

  if (!answers) blocks.push(section(':no_entry_sign: *Dismissed*'));

  return [...blocks, context(actorId ? `${verb} by <@${actorId}>` : verb)];
}

export function fallbackText(input: QuestionInput): string {
  return input.questions
    .map(({ header, question }) => `${escape(header)}: ${escape(question)}`)
    .join('\n');
}

export function customAnswerView({
  call,
  initialValue,
  metadata,
  q,
}: {
  call: ChannelQuestionCall;
  initialValue?: string;
  metadata: string;
  q: number;
}): SlackBlock {
  const item = call.input.questions[q]!;
  const quick = isQuickQuestion(call.input);

  return {
    type: 'modal',
    callback_id: CUSTOM_ANSWER_CALLBACK_ID,
    title: plain(truncate(item.header, MODAL_TITLE)),
    submit: plain(quick ? 'Submit' : 'Save'),
    close: plain('Cancel'),
    private_metadata: JSON.stringify({ m: metadata }),
    blocks: [
      section(prompt(item)),
      {
        type: 'input',
        block_id: blockIds.custom(call, q),
        optional: !quick,
        label: plain('Your answer'),
        element: {
          type: 'plain_text_input',
          action_id: CUSTOM_ANSWER_ACTION_ID,
          multiline: true,
          ...(initialValue ? { initial_value: initialValue } : {}),
        },
      },
    ],
  };
}

function quickBlocks(call: ChannelQuestionCall): SlackBlock[] {
  const item = call.input.questions[0]!;
  const buttons = item.options.length <= BUTTON_OPTIONS;
  const descriptions = buttons
    ? item.options.flatMap(({ label, description }) =>
        description ? [`• *${escape(label)}* — ${escape(description)}`] : [],
      )
    : [];

  const controls = buttons
    ? item.options.map((option, index) => ({
        type: 'button',
        action_id: `${actionIds.choose(call, 0)}:${index}`,
        text: plain(truncate(option.label, OPTION_TEXT)),
        value: String(index),
      }))
    : [choiceElement({ call, item, q: 0 })];

  return [
    section([prompt(item), ...descriptions].join('\n')),
    {
      type: 'actions',
      elements: [
        ...controls,
        ...(item.custom
          ? [button({ actionId: actionIds.custom(call, 0), text: 'Type your answer' })]
          : []),
        button({ actionId: actionIds.dismiss(call), text: 'Dismiss', style: 'danger' }),
      ],
    },
  ];
}

function formBlocks(call: ChannelQuestionCall): SlackBlock[] {
  const questions = call.input.questions.flatMap((item, q) => [
    section(prompt(item)),
    {
      type: 'actions',
      block_id: blockIds.question(call, q),
      elements: [
        choiceElement({ call, item, q }),
        ...(item.custom
          ? [button({ actionId: actionIds.custom(call, q), text: 'Type an answer' })]
          : []),
      ],
    },
  ]);

  return [
    ...questions,
    {
      type: 'actions',
      elements: [
        button({ actionId: actionIds.submit(call), text: 'Submit', style: 'primary' }),
        button({ actionId: actionIds.dismiss(call), text: 'Dismiss', style: 'danger' }),
      ],
    },
  ];
}

function choiceElement({
  call,
  item,
  q,
}: {
  call: ChannelQuestionCall;
  item: QuestionItem;
  q: number;
}): SlackBlock {
  const options = item.options.map(({ label, description }, index) => ({
    text: plain(truncate(label, OPTION_TEXT)),
    value: String(index),
    ...(description ? { description: plain(truncate(description, OPTION_TEXT)) } : {}),
  }));

  const actionId = actionIds.choose(call, q);

  if (options.length <= RADIO_OPTIONS) {
    return { type: item.multiple ? 'checkboxes' : 'radio_buttons', action_id: actionId, options };
  }

  return {
    type: item.multiple ? 'multi_static_select' : 'static_select',
    action_id: actionId,
    placeholder: plain(item.multiple ? 'Choose options' : 'Choose an option'),
    ...(options.length <= SELECT_OPTIONS
      ? { options }
      : {
          option_groups: chunk(options, SELECT_OPTIONS).map((group, index) => ({
            label: plain(
              `Options ${index * SELECT_OPTIONS + 1}–${index * SELECT_OPTIONS + group.length}`,
            ),
            options: group,
          })),
        }),
  };
}

function prompt({ header, question }: QuestionItem): string {
  return `*${escape(header)}*\n${escape(question)}`;
}

function button({
  actionId,
  style,
  text,
}: {
  actionId: string;
  style?: 'danger' | 'primary';
  text: string;
}): SlackBlock {
  return { type: 'button', action_id: actionId, text: plain(text), ...(style ? { style } : {}) };
}

function section(text: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text: truncate(text, 3000) } };
}

function context(text: string): SlackBlock {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}

function plain(text: string) {
  return { type: 'plain_text', text, emoji: true };
}

function escape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function chunk<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}
