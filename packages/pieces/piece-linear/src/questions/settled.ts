import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { Linear } from '../client.js';
import { escapeMarkdown, response } from './elicitation.js';
import { postActivity } from './linearThread.js';

export const settleLinearQuestion: PieceChannelQuestions<Linear>['settled'] = async ({
  actor,
  client,
  outcome,
  thread,
}) => {
  if ('output' in outcome || !actor) return;

  const name = actor.channel?.name ?? actor.channel?.username;

  await postActivity({
    activity: response(
      name ? `Stopped. ${escapeMarkdown(name)} dismissed the question.` : 'Stopped.',
    ),
    client,
    threadId: thread.id,
  });
};
