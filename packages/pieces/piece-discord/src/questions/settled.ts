import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { DiscordClient } from '../client.js';
import { settledPayload } from './components.js';
import { cardPath } from './discordThread.js';

export const settleDiscordQuestion: PieceChannelQuestions<DiscordClient>['settled'] = async ({
  actor,
  call,
  client,
  outcome,
  question,
  thread,
}) => {
  const responder = actor?.channel?.piece === 'discord' ? actor.channel : undefined;

  await client.request({
    method: 'PATCH',
    path: cardPath({ question, threadId: thread.id }),
    body: settledPayload({ call, outcome, responder }),
  });
};
