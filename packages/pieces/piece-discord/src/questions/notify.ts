import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { DiscordClient } from '../client.js';
import { postNotice } from './discordThread.js';

type DiscordQuestions = Required<PieceChannelQuestions<DiscordClient>>;

export const denyDiscordQuestion: DiscordQuestions['denied'] = ({
  client,
  interaction,
  question,
  thread,
}) =>
  postNotice({
    client,
    interaction,
    question,
    text: "You don't have access to answer this question.",
    threadId: thread.id,
  });

export const rejectDiscordQuestion: DiscordQuestions['rejected'] = ({
  client,
  interaction,
  question,
  reason,
  thread,
}) => postNotice({ client, interaction, question, text: reason, threadId: thread.id });
