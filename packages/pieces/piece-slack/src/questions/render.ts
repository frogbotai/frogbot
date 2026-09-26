import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { SlackClient } from '../client.js';
import { fallbackText, questionBlocks } from './blocks.js';
import { slackThread } from './slackThread.js';

export const renderSlackQuestion: PieceChannelQuestions<SlackClient>['render'] = async ({
  calls,
  client,
  thread,
}) => {
  const [call] = calls;

  if (!call) return [];

  const { channel, threadTs } = slackThread(thread.id);

  const response = await client.request('chat.postMessage', {
    channel,
    text: fallbackText(call.input),
    blocks: questionBlocks(call),
    ...(threadTs ? { thread_ts: threadTs } : {}),
  });

  if (typeof response.ts !== 'string') {
    throw new Error('Slack chat.postMessage did not return a message timestamp.');
  }

  return [{ messageId: response.ts, calls: [call.toolCallId] }];
};
