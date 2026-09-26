import { encodeQuestionModalMetadata, type PieceChannelQuestions } from 'frogbot/pieces';

import type { SlackClient } from '../client.js';
import { actionIds, customAnswerView } from './blocks.js';
import { interactionUserId, postEphemeral } from './slackThread.js';
import type { SlackQuestionState } from './state.js';
import { customAnswers } from './state.js';

export const updateSlackQuestion: NonNullable<
  PieceChannelQuestions<SlackClient>['updated']
> = async ({ call, client, interaction, messageId, state, thread }) => {
  if (interaction.type === 'modalSubmit') {
    await postEphemeral({
      client,
      interaction,
      text: 'Saved your typed answer. Press *Submit* when every question is answered.',
      threadId: thread.id,
    });

    return;
  }

  if (interaction.type !== 'action') return;

  const { actionId, triggerId } = interaction.event;
  const q = call.input.questions.findIndex(
    (_, index) => actionId === actionIds.custom(call, index),
  );

  if (q === -1 || !triggerId) return;

  const view = customAnswerView({
    call,
    initialValue: customAnswers({
      state: state as SlackQuestionState | undefined,
      userId: interactionUserId(interaction),
    })[q],
    metadata: encodeQuestionModalMetadata({ threadId: thread.id, messageId }),
    q,
  });

  try {
    await client.request('views.open', { trigger_id: triggerId, view });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('expired_trigger_id')) throw error;

    await postEphemeral({
      client,
      interaction,
      text: 'That took too long. Press the button again to type your answer.',
      threadId: thread.id,
    });
  }
};
