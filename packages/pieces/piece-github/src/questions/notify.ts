import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { GithubClient } from '../client.js';
import { escapeInline, instructions } from './comments.js';
import { postNotice } from './githubThread.js';
import { commentsFor, type GithubQuestionState, predatesQuestion, readState } from './state.js';

type GithubQuestions = Required<PieceChannelQuestions<GithubClient>>;

export const rejectGithubQuestion: GithubQuestions['rejected'] = ({
  call,
  interaction,
  question,
  reason,
  thread,
}) => {
  const { questions } = call.input;
  const { q } = readState(question.state);
  const item = questions[q];

  const shown = item && commentsFor({ question, q }).length > 0;

  const help = shown
    ? `\n\n${instructions({ item, total: questions.length })}`
    : ' Nothing was recorded, so read the next question before you answer again.';

  return postNotice({ interaction, text: `${escapeInline(reason)}${help}`, thread });
};

export const denyGithubQuestion: GithubQuestions['denied'] = ({ interaction, thread }) =>
  postNotice({ interaction, text: "doesn't have access to answer this question.", thread });

export const staleGithubQuestion: GithubQuestions['stale'] = ({
  call,
  interaction,
  question,
  thread,
}) => {
  const state = readState(question.state);
  const earlier =
    interaction.type === 'message' &&
    !state.closed &&
    predatesQuestion({ commentId: interaction.message.id, question });

  const total = call.input.questions.length;

  return postNotice({ interaction, text: staleText({ earlier, state, total }), thread });
};

function staleText({
  earlier,
  state,
  total,
}: {
  earlier: boolean;
  state: GithubQuestionState;
  total: number;
}): string {
  if (earlier && state.q === 0) {
    return 'That reply was sent before this question was posted. Reply again to answer it.';
  }

  if (earlier) {
    return `That reply was for an earlier question. Answer question ${state.q + 1} of ${total} instead.`;
  }

  if (!state.closed) return 'This question is no longer open.';

  const by = state.closed.by ? ` by \`@${state.closed.by}\`` : '';

  return `This question was already ${state.closed.dismissed ? 'dismissed' : 'answered'}${by}.`;
}
