import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { MicrosoftTeamsClient } from '../client.js';
import { settledCard, type SettledView } from './card.js';
import { teamsAdapter } from './teamsThread.js';

export const settleTeamsQuestion: PieceChannelQuestions<MicrosoftTeamsClient>['settled'] = async ({
  actor,
  call,
  messageId,
  outcome,
  thread,
}) => {
  const adapter = teamsAdapter(thread);
  const by = actor?.channel?.name ?? actor?.channel?.username;
  const view: SettledView = { outcome, ...(by ? { by } : {}) };

  await adapter.saveQuestionRecord({
    threadId: thread.id,
    toolCallId: call.toolCallId,
    record: { messageId, settled: view },
  });

  await adapter.updateAdaptiveCard({
    threadId: thread.id,
    messageId,
    card: settledCard({ call, ...view }),
  });
};
