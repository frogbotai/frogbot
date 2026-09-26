import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { Linear } from '../client.js';
import { elicitation } from './elicitation.js';
import { postActivity } from './linearThread.js';

export const renderLinearQuestion: PieceChannelQuestions<Linear>['render'] = async ({
  calls,
  client,
  thread,
}) => {
  const [call] = calls;

  if (!call) return [];

  const id = await postActivity({ activity: elicitation({ call }), client, threadId: thread.id });

  return [{ calls: [call.toolCallId], messages: [{ id, postedAt: '' }] }];
};
