import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { DiscordClient } from '../client.js';
import { postNotice } from './discordThread.js';

type DiscordQuestions = Required<PieceChannelQuestions<DiscordClient>>;

export const denyDiscordQuestion: DiscordQuestions['denied'] = ({
  client,
  interaction,
  messageId,
  thread,
}) =>
  postNotice({
    client,
    interaction,
    messageId,
    text: "You don't have access to answer this question.",
    threadId: thread.id,
  });

export const rejectDiscordQuestion: DiscordQuestions['rejected'] = ({
  client,
  interaction,
  messageId,
  reason,
  thread,
}) => postNotice({ client, interaction, messageId, text: reason, threadId: thread.id });
