import type {
  ChannelQuestionCall,
  PieceChannelQuestions,
  QuestionInput,
  QuestionOutput,
  QuestionParseResult,
} from 'frogbot/pieces';

import { DISMISS_ACTION_ID, inputIds, SUBMIT_ACTION_ID } from './card.js';

type QuestionItem = QuestionInput['questions'][number];
type Answer = QuestionOutput['answers'][number];

type SubmitActivity = { type?: unknown; value?: unknown };

export const parseTeamsQuestion: PieceChannelQuestions['parse'] = ({ call, interaction }) => {
  if (interaction.type !== 'action') return { kind: 'ignore' };

  const { actionId, raw, value } = interaction.event;
  const inputs = submittedInputs(raw);

  const submitted =
    (raw as SubmitActivity | undefined)?.type === 'message' &&
    inputs.actionId === actionId &&
    inputs.value === call.toolCallId &&
    value === call.toolCallId;

  if (!submitted) return { kind: 'ignore' };

  if (actionId === DISMISS_ACTION_ID) return { kind: 'dismiss' };

  if (actionId !== SUBMIT_ACTION_ID) return { kind: 'ignore' };

  return parseSubmit({ call, values: inputs });
};

export function submittedInputs(raw: unknown): Record<string, unknown> {
  const value = (raw as SubmitActivity | undefined)?.value;

  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function parseSubmit({
  call,
  values,
}: {
  call: ChannelQuestionCall;
  values: Record<string, unknown>;
}): QuestionParseResult {
  const answers: Answer[] = [];

  for (const [q, item] of call.input.questions.entries()) {
    const answer = parseAnswer({ item, q, values });

    if ('reason' in answer) return { kind: 'rejected', reason: answer.reason };

    answers.push(answer);
  }

  return { kind: 'answer', output: { answers } };
}

function parseAnswer({
  item,
  q,
  values,
}: {
  item: QuestionItem;
  q: number;
  values: Record<string, unknown>;
}): Answer | { reason: string } {
  const indexes = choiceIndexes(values[inputIds.choice(q)]);

  if (!indexes || indexes.some((index) => !item.options[index])) {
    return { reason: `“${item.header}” has an answer that was not offered. Choose again.` };
  }

  const chosen = [...new Set(indexes)].sort((a, b) => a - b);

  if (!item.multiple && chosen.length > 1) {
    return { reason: `Choose one answer for “${item.header}”.` };
  }

  const typed = values[inputIds.text(q)];
  const custom = item.custom && typeof typed === 'string' ? typed.trim() : '';

  const selected =
    custom && !item.multiple ? [] : chosen.map((index) => item.options[index]!.label);

  if (selected.length === 0 && !custom) {
    return { reason: `Answer “${item.header}” before submitting.` };
  }

  return { header: item.header, selected, ...(custom ? { custom } : {}) };
}

function choiceIndexes(value: unknown): number[] | null {
  if (value === undefined || value === null) return [];

  if (typeof value !== 'string') return null;

  if (!value.trim()) return [];

  const parts = value.split(',').map((part) => part.trim());

  if (!parts.every((part) => /^\d+$/.test(part))) return null;

  return parts.map(Number);
}
