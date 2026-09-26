import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { SlackClient } from '../client.js';
import { fallbackText, settledBlocks } from './blocks.js';
import { slackThread } from './slackThread.js';

export const settleSlackQuestion: PieceChannelQuestions<SlackClient>['settled'] = async ({
  actor,
  call,
  client,
  outcome,
  question,
  thread,
}) => {
  const { channel } = slackThread(thread.id);
  const actorId = actor?.channel?.piece === 'slack' ? actor.channel.id : undefined;

  const text = fallbackText(call.input);

  const blocks = settledBlocks({
    actorId,
    answers: 'output' in outcome ? outcome.output.answers : undefined,
    call,
  });

  await Promise.all(
    question.messages.map(({ id }) =>
      client.request('chat.update', { channel, ts: id, text, blocks }),
    ),
  );
};
