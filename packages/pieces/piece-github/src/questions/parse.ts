import type { PieceChannelQuestions, QuestionParseResult } from 'frogbot/pieces';

import { commentBody, commenter } from './githubThread.js';
import { readAnswer, readCommand } from './grammar.js';
import { type GithubQuestionState, predatesQuestion, readState } from './state.js';

const ignore: QuestionParseResult = { kind: 'ignore' };

export const parseGithubQuestion: PieceChannelQuestions['parse'] = ({
  call,
  interaction,
  question,
  settled,
}) => {
  if (interaction.type !== 'message') return ignore;

  const { message } = interaction;

  if (message.author.isBot || message.author.isMe) return ignore;

  const command = readCommand(commentBody(message));

  if (command.kind === 'none') return ignore;

  if (settled || predatesQuestion({ commentId: message.id, question })) return { kind: 'stale' };

  const state = readState(question.state);
  const item = call.input.questions[state.q];

  if (!item) return ignore;

  if (command.kind === 'dismiss') {
    return command.rest
      ? { kind: 'rejected', reason: 'Reply /dismiss on its own to decline.' }
      : { kind: 'dismiss' };
  }

  const answer = readAnswer({ item, text: command.rest });

  if ('reason' in answer) return { kind: 'rejected', reason: answer.reason };

  const answers = [...state.answers.slice(0, state.q), { header: item.header, ...answer }];

  if (answers.length === call.input.questions.length) {
    return { kind: 'answer', output: { answers } };
  }

  return {
    kind: 'partial',
    state: {
      q: state.q + 1,
      answers,
      by: [...state.by.slice(0, state.q), commenter(message)],
    } satisfies GithubQuestionState,
  };
};
