import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { SlackClient } from '../client.js';
import { fallbackText, settledBlocks } from './blocks.js';
import { slackThread } from './slackThread.js';

export const settleSlackQuestion: PieceChannelQuestions<SlackClient>['settled'] = async ({
  actor,
  call,
  client,
  messageId,
  outcome,
  thread,
}) => {
  const { channel } = slackThread(thread.id);
  const actorId = actor?.channel?.piece === 'slack' ? actor.channel.id : undefined;

  await client.request('chat.update', {
    channel,
    ts: messageId,
    text: fallbackText(call.input),
    blocks: settledBlocks({
      actorId,
      answers: 'output' in outcome ? outcome.output.answers : undefined,
      call,
    }),
  });
};
