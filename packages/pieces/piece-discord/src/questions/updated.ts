import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { DiscordClient } from '../client.js';
import { questionLayout, questionPayload } from './components.js';
import { cardPath } from './discordThread.js';
import { decodeQuestionId } from './ids.js';
import { readState, withoutPicks } from './state.js';

export const updateDiscordQuestion: NonNullable<
  PieceChannelQuestions<DiscordClient>['updated']
> = async ({ call, client, interaction, question, thread }) => {
  const control =
    interaction?.type === 'action' ? decodeQuestionId(interaction.event.actionId) : null;
  const pick = control?.verb === 'select' && call.input.questions[control.q]?.multiple;

  if (pick) return;

  const state = readState(question.state);

  await client.request({
    method: 'PATCH',
    path: cardPath({ question, threadId: thread.id }),
    body: questionPayload({ call, state }),
  });

  const layout = questionLayout({ item: call.input.questions[state.q]!, page: state.page });
  const selects = layout.kind === 'selects' ? layout.selects : [];

  return { state: withoutPicks({ selects, state }) };
};
