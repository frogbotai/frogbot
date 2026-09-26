import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { TelegramBotClient } from '../client.js';
import { settledMessage } from './keyboard.js';
import { readState, type TelegramSettledView } from './state.js';
import { actorName, editQuestionMessage } from './telegramThread.js';

export const settleTelegramQuestion: PieceChannelQuestions<TelegramBotClient>['settled'] = async ({
  actor,
  call,
  client,
  outcome,
  question,
  req,
  thread,
}) => {
  const view: TelegramSettledView = {
    ...(actorName(actor) ? { actor: actorName(actor) } : {}),
    ...('output' in outcome ? { answers: outcome.output.answers } : {}),
  };

  const body = settledMessage({ ...view, call });

  try {
    await Promise.all(
      question.messages.map(({ id }) =>
        editQuestionMessage({ body, client, messageId: id, threadId: thread.id }),
      ),
    );
  } catch (error) {
    req.frogbot.logger.error(
      { err: error, piece: 'telegramBot', toolCallId: call.toolCallId },
      '[piece-telegram-bot] Could not mark a question answered.',
    );
  }

  return { state: { ...readState(question.state), settled: view } };
};
