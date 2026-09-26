import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { MicrosoftTeamsClient } from '../client.js';
import { settledCard, type SettledView } from './card.js';
import { teamsAdapter, type TeamsQuestionState, updateCards } from './teamsThread.js';

export const settleTeamsQuestion: PieceChannelQuestions<MicrosoftTeamsClient>['settled'] = async ({
  actor,
  call,
  outcome,
  question,
  thread,
}) => {
  const by = actor?.channel?.name ?? actor?.channel?.username;
  const view: SettledView = { outcome, ...(by ? { by } : {}) };
  const state: TeamsQuestionState = { settled: view };

  try {
    await updateCards({ card: settledCard({ call, ...view }), question, thread });
  } catch (error) {
    teamsAdapter(thread).logQuestionWarning(
      'Updating a settled Teams question card failed; the next click restores it',
      { toolCallId: call.toolCallId, error },
    );
  }

  return { state };
};
