import type {
  ChannelQuestionCall,
  PieceChannelQuestions,
  QuestionInteraction,
  QuestionParseResult,
  QuestionRecord,
} from 'frogbot/pieces';

import { decodeAction, optionPages, selectedLabels } from './keyboard.js';
import type { TelegramQuestionAnswer, TelegramQuestionState } from './state.js';
import { readState } from './state.js';

type ReplyMessage = Extract<QuestionInteraction, { type: 'message' }>['message'];

const IGNORE: QuestionParseResult = { kind: 'ignore' };

export const parseTelegramQuestion: PieceChannelQuestions['parse'] = ({
  call,
  interaction,
  question,
  settled,
}) => {
  const state = readState(question.state);

  if (interaction.type === 'action') {
    return parseAction({ call, data: interaction.event.actionId, state });
  }

  if (interaction.type === 'message' && !settled) {
    return parseReply({ call, message: interaction.message, question, state });
  }

  return IGNORE;
};

function parseAction({
  call,
  data,
  state,
}: {
  call: ChannelQuestionCall;
  data: string;
  state: TelegramQuestionState;
}): QuestionParseResult {
  const action = decodeAction(data);

  if (!action) return IGNORE;

  if (action.kind === 'dismiss') return { kind: 'dismiss' };

  if (action.q !== state.q) return { kind: 'stale' };

  const item = call.input.questions[state.q];

  if (!item) return IGNORE;

  switch (action.kind) {
    case 'choose': {
      const option = item.options[action.index];

      if (item.multiple || !option) return IGNORE;

      return advance({ call, state, answer: { header: item.header, selected: [option.label] } });
    }

    case 'toggle': {
      if (!item.multiple || !item.options[action.index]) return IGNORE;

      const selected = state.selected.includes(action.index)
        ? state.selected.filter((index) => index !== action.index)
        : [...state.selected, action.index].sort((a, b) => a - b);

      return { kind: 'partial', state: { ...state, selected } };
    }

    case 'done': {
      if (!item.multiple) return IGNORE;

      const selected = selectedLabels({ item, selected: state.selected });

      if (selected.length === 0) {
        return { kind: 'rejected', reason: 'Select at least one option, then tap Done.' };
      }

      return advance({ call, state, answer: { header: item.header, selected } });
    }

    case 'type':
      return item.custom ? { kind: 'partial', state: { ...state, typing: true } } : IGNORE;

    case 'back':
      return { kind: 'partial', state: { ...state, typing: false } };

    case 'page':
      return action.page < optionPages(item).length
        ? { kind: 'partial', state: { ...state, page: action.page } }
        : IGNORE;
  }
}

function parseReply({
  call,
  message,
  question,
  state,
}: {
  call: ChannelQuestionCall;
  message: ReplyMessage;
  question: QuestionRecord;
  state: TelegramQuestionState;
}): QuestionParseResult {
  const item = call.input.questions[state.q];
  const bound = message.replyTo?.id === question.messages.at(-1)?.id;

  if (!item?.custom || !state.typing || !bound) return IGNORE;

  const custom = message.text.trim();

  if (!custom) return { kind: 'rejected', reason: 'Reply with your answer as text.' };

  return advance({
    call,
    state,
    answer: {
      header: item.header,
      selected: item.multiple ? selectedLabels({ item, selected: state.selected }) : [],
      custom,
    },
  });
}

function advance({
  answer,
  call,
  state,
}: {
  answer: TelegramQuestionAnswer;
  call: ChannelQuestionCall;
  state: TelegramQuestionState;
}): QuestionParseResult {
  const answers = [...state.answers.slice(0, state.q), answer];

  if (answers.length === call.input.questions.length) {
    return { kind: 'answer', output: { answers } };
  }

  return {
    kind: 'partial',
    state: { q: state.q + 1, page: 0, answers, selected: [], typing: false },
  };
}
