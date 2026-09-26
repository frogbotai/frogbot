import type { PieceChannelQuestions, QuestionInteraction } from 'frogbot/pieces';

import type { TelegramBotClient } from '../client.js';
import { decodeAction, questionMessage } from './keyboard.js';
import { readState } from './state.js';
import { editQuestionMessage } from './telegramThread.js';

export const updateTelegramQuestion: NonNullable<
  PieceChannelQuestions<TelegramBotClient>['updated']
> = async ({ call, client, interaction, question, req, thread }) => {
  const body = questionMessage({ call, state: readState(question.state) });

  const redraw = () =>
    editQuestionMessage({
      body,
      client,
      messageId: question.messages.at(-1)!.id,
      threadId: thread.id,
    });

  if (advances(interaction)) {
    await redraw();

    return;
  }

  try {
    await redraw();
  } catch (error) {
    req.frogbot.logger.error(
      { err: error, piece: 'telegramBot', toolCallId: call.toolCallId },
      '[piece-telegram-bot] Could not redraw a question.',
    );
  }
};

function advances(interaction: QuestionInteraction | undefined): boolean {
  if (!interaction || interaction.type === 'message') return true;

  if (interaction.type !== 'action') return false;

  const action = decodeAction(interaction.event.actionId);

  return action?.kind === 'choose' || action?.kind === 'done';
}
