import type { PieceChannelQuestions, QuestionInteraction } from 'frogbot/pieces';

import type { Linear } from '../client.js';
import { elicitation, escapeMarkdown, response } from './elicitation.js';
import { postActivity, stopRequested } from './linearThread.js';

type LinearQuestions = Required<PieceChannelQuestions<Linear>>;

export const denyLinearQuestion: LinearQuestions['denied'] = async ({
  call,
  client,
  interaction,
  thread,
}) => {
  const notice = `${authorName(interaction)} can't answer this question without access to this agent. It is still open.`;

  await postActivity({ activity: elicitation({ call, notice }), client, threadId: thread.id });
};

export const rejectLinearQuestion: LinearQuestions['rejected'] = async ({
  call,
  client,
  reason,
  thread,
}) => {
  await postActivity({
    activity: elicitation({ call, notice: reason }),
    client,
    threadId: thread.id,
  });
};

export const staleLinearQuestion: LinearQuestions['stale'] = async ({
  client,
  interaction,
  thread,
}) => {
  const body = stopRequested(interaction)
    ? 'This question was already answered. A stop request only dismisses an open question.'
    : 'This question was already answered.';

  await postActivity({ activity: response(body), client, threadId: thread.id });
};

function authorName(interaction: QuestionInteraction): string {
  const author =
    interaction.type === 'message' ? interaction.message.author : interaction.event.user;
  const name = author.fullName || author.userName;

  return name ? escapeMarkdown(name) : 'This participant';
}
