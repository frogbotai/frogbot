import type { PieceChannelQuestions, QuestionInteraction, QuestionRecord } from 'frogbot/pieces';

import type { TelegramBotClient } from '../client.js';
import { settledMessage } from './keyboard.js';
import { readState } from './state.js';
import {
  editQuestionMessage,
  responderName,
  telegramMessageId,
  telegramTarget,
} from './telegramThread.js';

type TelegramQuestions = Required<PieceChannelQuestions<TelegramBotClient>>;

export const denyTelegramQuestion: TelegramQuestions['denied'] = ({
  client,
  interaction,
  question,
  thread,
}) =>
  notify({
    client,
    interaction,
    question,
    text:
      interaction.type === 'message'
        ? "You don't have access to answer this question."
        : `${responderName(interaction)}, you don't have access to answer this question.`,
    threadId: thread.id,
  });

export const rejectTelegramQuestion: TelegramQuestions['rejected'] = ({
  client,
  interaction,
  question,
  reason,
  thread,
}) => notify({ client, interaction, question, text: reason, threadId: thread.id });

export const staleTelegramQuestion: TelegramQuestions['stale'] = async ({
  call,
  client,
  interaction,
  question,
  req,
  thread,
}) => {
  if (interaction.type === 'message') {
    await notify({
      client,
      interaction,
      question,
      text: 'This question was already answered.',
      threadId: thread.id,
    });

    return;
  }

  const view = readState(question.state).settled;

  if (!view) return;

  try {
    await editQuestionMessage({
      body: settledMessage({ ...view, call }),
      client,
      messageId: question.messages.at(-1)!.id,
      threadId: thread.id,
    });
  } catch (error) {
    req.frogbot.logger.error(
      { err: error, piece: 'telegramBot', toolCallId: call.toolCallId },
      '[piece-telegram-bot] Could not restore an answered question.',
    );
  }
};

async function notify({
  client,
  interaction,
  question,
  text,
  threadId,
}: {
  client: TelegramBotClient;
  interaction: QuestionInteraction;
  question: QuestionRecord;
  text: string;
  threadId: string;
}): Promise<void> {
  const replyTo =
    interaction.type === 'message' ? interaction.message.id : question.messages.at(-1)!.id;

  await client.call('sendMessage', {
    ...telegramTarget(threadId),
    text,
    link_preview_options: { is_disabled: true },
    reply_parameters: { message_id: telegramMessageId(replyTo), allow_sending_without_reply: true },
  });
}
