import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { DiscordClient } from '../client.js';
import { settledPayload } from './components.js';
import { discordChannelId } from './discordThread.js';

export const settleDiscordQuestion: PieceChannelQuestions<DiscordClient>['settled'] = async ({
  actor,
  call,
  client,
  messageId,
  outcome,
  thread,
}) => {
  const responder = actor?.channel?.piece === 'discord' ? actor.channel : undefined;

  await client.request({
    method: 'PATCH',
    path: `/channels/${discordChannelId(thread.id)}/messages/${encodeURIComponent(messageId)}`,
    body: settledPayload({ call, outcome, responder }),
  });
};
