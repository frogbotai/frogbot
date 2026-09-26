import type { ChannelQuestionCall, QuestionInput, QuestionOutcome } from 'frogbot/pieces';

export const QUESTION_ACTION_PREFIX = 'frogbot.question.';
export const SUBMIT_ACTION_ID = `${QUESTION_ACTION_PREFIX}submit`;
export const DISMISS_ACTION_ID = `${QUESTION_ACTION_PREFIX}dismiss`;
export const CARD_BUDGET = 24 * 1024;
export const CUSTOM_ANSWER_LENGTH = 2000;
export const EXPANDED_OPTIONS = 10;

const ADAPTIVE_CARD = 'application/vnd.microsoft.card.adaptive';

type QuestionItem = QuestionInput['questions'][number];

type CardLayout = {
  compact: boolean;
  descriptions: number | false | undefined;
  titles?: number;
  questions?: number;
};

type SettledLayout = {
  answers?: number;
  questions?: number | false;
};

const layouts: CardLayout[] = [
  { compact: false, descriptions: undefined },
  { compact: true, descriptions: undefined },
  { compact: true, descriptions: 120 },
  { compact: true, descriptions: 40 },
  { compact: true, descriptions: false },
  { compact: true, descriptions: false, titles: 80 },
  { compact: true, descriptions: false, titles: 80, questions: 500 },
];

const settledLayouts: SettledLayout[] = [
  {},
  { answers: 1000, questions: 500 },
  { answers: 200, questions: 200 },
  { answers: 60, questions: false },
];

const FALLBACK_QUESTION = 200;

export type CardElement = Record<string, unknown>;

type TextStyle = {
  color?: 'Attention';
  isSubtle?: boolean;
  separator?: boolean;
  size?: 'Small';
  spacing?: 'Small' | 'Medium';
  weight?: 'Bolder';
};

export type AdaptiveCard = {
  type: 'AdaptiveCard';
  $schema: string;
  version: '1.5';
  fallbackText: string;
  body: CardElement[];
  actions?: CardElement[];
};

export type QuestionValues = Record<string, string>;

export type SettledView = {
  outcome: QuestionOutcome;
  by?: string;
};

export const inputIds = {
  choice: (q: number) => `question-${q}`,
  text: (q: number) => `question-${q}-text`,
};

export class TeamsQuestionCardTooLarge extends Error {
  constructor(bytes: number) {
    super(
      `The Microsoft Teams question card is ${bytes} bytes after every size reduction; the limit is ${CARD_BUDGET}.`,
    );

    this.name = 'TeamsQuestionCardTooLarge';
  }
}

export function questionCard({
  call,
  error,
  values,
}: {
  call: ChannelQuestionCall;
  error?: string;
  values?: QuestionValues;
}): AdaptiveCard {
  const prefills = values ? [values, undefined] : [undefined];

  const fitted = fit(
    prefills.flatMap((prefill) =>
      layouts.map((layout) => () => buildQuestionCard({ call, error, layout, values: prefill })),
    ),
  );

  if (!fitted.card) throw new TeamsQuestionCardTooLarge(fitted.bytes);

  return fitted.card;
}

export function settledCard({
  by,
  call,
  outcome,
}: SettledView & { call: ChannelQuestionCall }): AdaptiveCard {
  const answers = 'output' in outcome ? outcome.output.answers : undefined;
  const verb = answers ? 'Answered' : 'Dismissed';

  const footer = text(by ? `${verb} by ${by}` : verb, {
    spacing: 'Medium',
    ...(answers ? { isSubtle: true, size: 'Small' } : { weight: 'Bolder', color: 'Attention' }),
  });

  const build = (layout: SettledLayout) => {
    const body = call.input.questions.flatMap((item, q): CardElement[] => {
      const answer = answers?.[q];

      const values = answer
        ? [...answer.selected, ...(answer.custom ? [`“${answer.custom}”`] : [])]
        : [];

      const prompt =
        layout.questions === false
          ? []
          : [text(truncate(item.question, layout.questions), { isSubtle: true, spacing: 'Small' })];

      const result = answer
        ? [text(truncate(`✅ ${values.join(', ')}`, layout.answers), { spacing: 'Small' })]
        : [];

      return [header({ item, q }), ...prompt, ...result];
    });

    return card({ call, body: [...body, footer] });
  };

  return (
    fit(settledLayouts.map((layout) => () => build(layout))).card ?? card({ call, body: [footer] })
  );
}

export function closedCard({ call }: { call: ChannelQuestionCall }): AdaptiveCard {
  const body = call.input.questions.map((item, q) => header({ item, q }));

  return card({
    call,
    body: [
      ...body,
      text('This question is no longer open.', { isSubtle: true, spacing: 'Medium' }),
    ],
  });
}

export function overflowCard({ call }: { call: ChannelQuestionCall }): AdaptiveCard {
  const body = call.input.questions.flatMap((item, q) => [
    header({ item, q }),
    text(truncate(item.question, FALLBACK_QUESTION), { spacing: 'Small' }),
  ]);

  const notice = text(
    'This question is too large to show in Teams. Answer it in FrogBot, or dismiss it here.',
    { color: 'Attention', spacing: 'Medium' },
  );

  return card({ call, body: [...body, notice], actions: [dismissAction(call)] });
}

export function cardActivity(content: AdaptiveCard) {
  return { type: 'message' as const, attachments: [{ contentType: ADAPTIVE_CARD, content }] };
}

export function cardSize(content: AdaptiveCard): number {
  return Buffer.byteLength(JSON.stringify(cardActivity(content)));
}

function buildQuestionCard({
  call,
  error,
  layout,
  values,
}: {
  call: ChannelQuestionCall;
  error?: string;
  layout: CardLayout;
  values?: QuestionValues;
}): AdaptiveCard {
  const body = call.input.questions.flatMap((item, q) => [
    header({ item, q }),
    choiceSet({ item, layout, q, value: values?.[inputIds.choice(q)] }),
    ...(item.custom ? [textInput({ q, value: values?.[inputIds.text(q)] })] : []),
  ]);

  if (error) body.push(text(error, { color: 'Attention', spacing: 'Medium' }));

  return card({
    call,
    body,
    actions: [
      {
        type: 'Action.Submit',
        title: 'Submit',
        style: 'positive',
        data: { actionId: SUBMIT_ACTION_ID, value: call.toolCallId },
      },
      dismissAction(call),
    ],
  });
}

function dismissAction(call: ChannelQuestionCall): CardElement {
  return {
    type: 'Action.Submit',
    title: 'Dismiss',
    style: 'destructive',
    associatedInputs: 'none',
    data: { actionId: DISMISS_ACTION_ID, value: call.toolCallId },
  };
}

function header({ item, q }: { item: QuestionItem; q: number }): CardElement {
  return text(item.header, {
    weight: 'Bolder',
    ...(q > 0 ? { separator: true, spacing: 'Medium' } : {}),
  });
}

function text(value: string, { separator, spacing, ...style }: TextStyle = {}): CardElement {
  return {
    type: 'RichTextBlock',
    inlines: [{ type: 'TextRun', text: value, ...style }],
    ...(separator ? { separator } : {}),
    ...(spacing ? { spacing } : {}),
  };
}

function choiceSet({
  item,
  layout,
  q,
  value,
}: {
  item: QuestionItem;
  layout: CardLayout;
  q: number;
  value?: string;
}): CardElement {
  const compact = layout.compact || item.options.length > EXPANDED_OPTIONS;

  const choices = item.options.map(({ description, label }, index) => {
    const detail =
      description && layout.descriptions !== false
        ? truncate(description, layout.descriptions)
        : undefined;

    return {
      title: truncate(detail ? `${label} — ${detail}` : label, layout.titles),
      value: String(index),
    };
  });

  return {
    type: 'Input.ChoiceSet',
    id: inputIds.choice(q),
    label: truncate(item.question, layout.questions),
    style: compact ? 'compact' : 'expanded',
    isMultiSelect: item.multiple === true,
    wrap: true,
    choices,
    ...(compact ? { placeholder: item.multiple ? 'Choose options' : 'Choose an option' } : {}),
    ...(item.custom
      ? {}
      : { isRequired: true, errorMessage: `Choose an answer for “${item.header}”.` }),
    ...(value ? { value } : {}),
  };
}

function textInput({ q, value }: { q: number; value?: string }): CardElement {
  return {
    type: 'Input.Text',
    id: inputIds.text(q),
    label: 'Or type your own answer',
    isMultiline: true,
    maxLength: CUSTOM_ANSWER_LENGTH,
    ...(value ? { value } : {}),
  };
}

function card({
  actions,
  body,
  call,
}: {
  actions?: CardElement[];
  body: CardElement[];
  call: ChannelQuestionCall;
}): AdaptiveCard {
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.5',
    fallbackText: call.input.questions
      .map(({ header, question }) => `${header}: ${truncate(question, FALLBACK_QUESTION)}`)
      .join('\n'),
    body,
    ...(actions ? { actions } : {}),
  };
}

function fit(candidates: Array<() => AdaptiveCard>): { card?: AdaptiveCard; bytes: number } {
  let bytes = 0;

  for (const candidate of candidates) {
    const card = candidate();

    bytes = cardSize(card);

    if (bytes <= CARD_BUDGET) return { card, bytes };
  }

  return { bytes };
}

function truncate(text: string, limit: number | undefined): string {
  if (limit === undefined || text.length <= limit) return text;

  return `${text.slice(0, limit - 1)}…`;
}
