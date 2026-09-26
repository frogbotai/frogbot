import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { SlackClient } from '../client.js';
import { postEphemeral } from './slackThread.js';

type SlackQuestions = Required<PieceChannelQuestions<SlackClient>>;

export const denySlackQuestion: SlackQuestions['denied'] = ({ client, interaction, thread }) =>
  postEphemeral({
    client,
    interaction,
    text: "You don't have access to answer this question.",
    threadId: thread.id,
  });

export const rejectSlackQuestion: SlackQuestions['rejected'] = ({
  client,
  interaction,
  reason,
  thread,
}) => postEphemeral({ client, interaction, text: reason, threadId: thread.id });

export const staleSlackQuestion: SlackQuestions['stale'] = ({ client, interaction, thread }) =>
  postEphemeral({
    client,
    interaction,
    text: 'This question was already answered.',
    threadId: thread.id,
  });
