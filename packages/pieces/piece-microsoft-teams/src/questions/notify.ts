import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { MicrosoftTeamsClient } from '../client.js';
import { closedCard, settledCard } from './card.js';
import { interactionUser, postTargeted, teamsAdapter } from './teamsThread.js';

type TeamsQuestions = Required<PieceChannelQuestions<MicrosoftTeamsClient>>;

export const denyTeamsQuestion: TeamsQuestions['denied'] = ({ interaction, thread }) =>
  postTargeted({
    interaction,
    thread,
    text: interactionUser(interaction).email
      ? "You don't have access to answer this question."
      : "FrogBot couldn't match your Teams account to a user, so you can't answer this question.",
  });

export const staleTeamsQuestion: TeamsQuestions['stale'] = async ({
  call,
  interaction,
  messageId,
  thread,
}) => {
  const adapter = teamsAdapter(thread);

  const record = await adapter.findQuestionRecord({
    threadId: thread.id,
    toolCallId: call.toolCallId,
  });

  const settled = record?.settled;

  await Promise.all([
    adapter.updateAdaptiveCard({
      threadId: thread.id,
      messageId,
      card: settled ? settledCard({ call, ...settled }) : closedCard({ call }),
    }),
    postTargeted({
      interaction,
      thread,
      text: settled ? 'This question was already answered.' : 'This question is no longer open.',
    }),
  ]);
};
