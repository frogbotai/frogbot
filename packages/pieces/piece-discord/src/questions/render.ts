import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { DiscordClient } from '../client.js';
import { questionPayload } from './components.js';
import { discordChannelId } from './discordThread.js';
import { readState } from './state.js';

export const renderDiscordQuestion: PieceChannelQuestions<DiscordClient>['render'] = async ({
  calls,
  client,
  thread,
}) => {
  const [call] = calls;

  if (!call) return [];

  const response = await client.request({
    method: 'POST',
    path: `/channels/${discordChannelId(thread.id)}/messages`,
    body: questionPayload({ call, state: readState(undefined) }),
  });

  const id = (response.body as { id?: unknown } | undefined)?.id;

  if (typeof id !== 'string') throw new Error('Discord did not return the question message id.');

  return [{ messageId: id, calls: [call.toolCallId] }];
};
