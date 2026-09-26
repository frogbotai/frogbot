import type { ChannelQuestionCall, PieceChannelQuestions, QuestionHookArgs } from 'frogbot/pieces';

import type { MicrosoftTeamsClient } from '../client.js';
import {
  type AdaptiveCard,
  overflowCard,
  questionCard,
  TeamsQuestionCardTooLarge,
} from './card.js';
import { teamsAdapter } from './teamsThread.js';

export const renderTeamsQuestion: PieceChannelQuestions<MicrosoftTeamsClient>['render'] = async ({
  calls,
  req,
  thread,
}) => {
  const [call] = calls;

  if (!call) return [];

  const adapter = teamsAdapter(thread);

  const messageId = await adapter.sendAdaptiveCard({
    threadId: thread.id,
    card: renderedCard({ call, req }),
  });

  await adapter.saveQuestionRecord({
    threadId: thread.id,
    toolCallId: call.toolCallId,
    record: { messageId },
  });

  return [{ messageId, calls: [call.toolCallId] }];
};

function renderedCard({
  call,
  req,
}: {
  call: ChannelQuestionCall;
  req: QuestionHookArgs<unknown>['req'];
}): AdaptiveCard {
  try {
    return questionCard({ call });
  } catch (error) {
    if (!(error instanceof TeamsQuestionCardTooLarge)) throw error;

    req.frogbot.logger.warn(
      { err: error, toolCallId: call.toolCallId },
      '[frogbot] Teams question card is too large; posting a dismiss-only card.',
    );

    return overflowCard({ call });
  }
}
