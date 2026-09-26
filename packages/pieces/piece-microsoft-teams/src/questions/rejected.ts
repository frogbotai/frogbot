import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { MicrosoftTeamsClient } from '../client.js';
import { questionCard, TeamsQuestionCardTooLarge } from './card.js';
import { postTargeted, submittedValues, teamsAdapter } from './teamsThread.js';

export const rejectTeamsQuestion: NonNullable<
  PieceChannelQuestions<MicrosoftTeamsClient>['rejected']
> = async ({ call, interaction, messageId, reason, thread }) => {
  const values = submittedValues({ count: call.input.questions.length, interaction });

  let card;

  try {
    card = questionCard({ call, error: reason, values });
  } catch (error) {
    if (!(error instanceof TeamsQuestionCardTooLarge)) throw error;

    await postTargeted({ interaction, text: reason, thread });

    return;
  }

  await teamsAdapter(thread).updateAdaptiveCard({ threadId: thread.id, messageId, card });
};
