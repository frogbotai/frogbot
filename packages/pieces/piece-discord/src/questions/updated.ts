import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { DiscordClient } from '../client.js';
import { questionPayload } from './components.js';
import { discordChannelId } from './discordThread.js';
import { decodeQuestionId } from './ids.js';
import { readState } from './state.js';

export const updateDiscordQuestion: NonNullable<
  PieceChannelQuestions<DiscordClient>['updated']
> = async ({ call, client, interaction, messageId, state, thread }) => {
  const control =
    interaction.type === 'action' ? decodeQuestionId(interaction.event.actionId) : null;
  const pick = control?.verb === 'select' && call.input.questions[control.q]?.multiple;

  if (pick) return;

  await client.request({
    method: 'PATCH',
    path: `/channels/${discordChannelId(thread.id)}/messages/${encodeURIComponent(messageId)}`,
    body: questionPayload({ call, state: readState(state) }),
  });
};
