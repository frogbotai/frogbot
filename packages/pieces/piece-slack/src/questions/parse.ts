import type {
  ChannelQuestionCall,
  PieceChannelQuestions,
  QuestionParseResult,
} from 'frogbot/pieces';

import {
  actionIds,
  blockIds,
  CUSTOM_ANSWER_ACTION_ID,
  CUSTOM_ANSWER_CALLBACK_ID,
  isQuickQuestion,
} from './blocks.js';
import type { SlackQuestionState } from './state.js';
import { customAnswers, withCustomAnswer } from './state.js';

type SlackStateValue = {
  selected_option?: { value: string } | null;
  selected_options?: Array<{ value: string }>;
  value?: string | null;
};

type SlackStateValues = Record<string, Record<string, SlackStateValue>>;

type SlackActionPayload = {
  actions?: Array<{
    action_id: string;
    selected_option?: { value: string } | null;
    value?: string;
  }>;
  state?: { values?: SlackStateValues };
};

type SlackViewPayload = {
  view?: { callback_id?: string; state?: { values?: SlackStateValues } };
};

export const parseSlackQuestion: PieceChannelQuestions['parse'] = ({
  call,
  interaction,
  state,
}) => {
  if (interaction.type === 'message') return { kind: 'ignore' };

  return interaction.type === 'action'
    ? parseAction({
        actionId: interaction.event.actionId,
        call,
        payload: interaction.event.raw as SlackActionPayload,
        state: state as SlackQuestionState | undefined,
        userId: interaction.event.user.userId,
      })
    : parseCustomAnswer({
        call,
        payload: interaction.event.raw as SlackViewPayload,
        state: state as SlackQuestionState | undefined,
        userId: interaction.event.user.userId,
      });
};

function parseAction({
  actionId,
  call,
  payload,
  state,
  userId,
}: {
  actionId: string;
  call: ChannelQuestionCall;
  payload: SlackActionPayload;
  state?: SlackQuestionState;
  userId: string;
}): QuestionParseResult {
  if (actionId === actionIds.dismiss(call)) return { kind: 'dismiss' };

  if (actionId === actionIds.submit(call)) return parseSubmit({ call, payload, state, userId });

  const custom = call.input.questions.findIndex((_, q) => actionId === actionIds.custom(call, q));

  if (custom !== -1) return { kind: 'partial' };

  if (!isQuickQuestion(call.input)) return { kind: 'ignore' };

  const choose = actionIds.choose(call, 0);

  if (actionId !== choose && !actionId.startsWith(`${choose}:`)) return { kind: 'ignore' };

  const action = payload.actions?.find(({ action_id }) => action_id === actionId);
  const item = call.input.questions[0]!;
  const option = item.options[Number(action?.selected_option?.value ?? action?.value)];

  if (!option) return { kind: 'ignore' };

  return {
    kind: 'answer',
    output: { answers: [{ header: item.header, selected: [option.label] }] },
  };
}

function parseSubmit({
  call,
  payload,
  state,
  userId,
}: {
  call: ChannelQuestionCall;
  payload: SlackActionPayload;
  state?: SlackQuestionState;
  userId: string;
}): QuestionParseResult {
  const values = payload.state?.values;

  if (!values) {
    return { kind: 'rejected', reason: 'Slack did not send your selections. Try again.' };
  }

  const typed = customAnswers({ state, userId });

  const answers = call.input.questions.map((item, q) => {
    const element = values[blockIds.question(call, q)]?.[actionIds.choose(call, q)];
    const chosen =
      element?.selected_options ?? (element?.selected_option ? [element.selected_option] : []);
    const custom = item.custom ? typed[q]?.trim() : undefined;

    const selected = chosen
      .map(({ value }) => Number(value))
      .filter((index) => item.options[index] !== undefined)
      .sort((a, b) => a - b)
      .map((index) => item.options[index]!.label);

    return {
      header: item.header,
      selected: custom && !item.multiple ? [] : selected,
      ...(custom ? { custom } : {}),
    };
  });

  const missing = answers.find(({ custom, selected }) => selected.length === 0 && !custom);

  if (missing) return { kind: 'rejected', reason: `Answer “${missing.header}” before submitting.` };

  return { kind: 'answer', output: { answers } };
}

function parseCustomAnswer({
  call,
  payload,
  state,
  userId,
}: {
  call: ChannelQuestionCall;
  payload: SlackViewPayload;
  state?: SlackQuestionState;
  userId: string;
}): QuestionParseResult {
  if (payload.view?.callback_id !== CUSTOM_ANSWER_CALLBACK_ID) return { kind: 'ignore' };

  const values = payload.view.state?.values ?? {};
  const q = call.input.questions.findIndex((_, index) => blockIds.custom(call, index) in values);

  if (q === -1) return { kind: 'ignore' };

  const text = values[blockIds.custom(call, q)]?.[CUSTOM_ANSWER_ACTION_ID]?.value?.trim() ?? '';

  if (!isQuickQuestion(call.input)) {
    return { kind: 'partial', state: withCustomAnswer({ q, state, text, userId }) };
  }

  if (!text) return { kind: 'rejected', reason: 'Type an answer before submitting.' };

  const item = call.input.questions[0]!;

  return {
    kind: 'answer',
    output: { answers: [{ header: item.header, selected: [], custom: text }] },
  };
}
