import type { QuestionHookArgs, QuestionInteraction } from 'frogbot/pieces';

import { FrogBotTeamsAdapter } from '../adapter.js';
import { inputIds, type QuestionValues } from './card.js';
import { submittedInputs } from './parse.js';

type Thread = QuestionHookArgs<unknown>['thread'];

export function teamsAdapter(thread: Thread): FrogBotTeamsAdapter {
  if (!(thread.adapter instanceof FrogBotTeamsAdapter)) {
    throw new Error('Microsoft Teams questions require the FrogBot Teams adapter.');
  }

  return thread.adapter;
}

export function interactionUser(interaction: QuestionInteraction) {
  return interaction.type === 'message' ? interaction.message.author : interaction.event.user;
}

export function submittedValues({
  count,
  interaction,
}: {
  count: number;
  interaction: QuestionInteraction;
}): QuestionValues {
  const inputs = interaction.type === 'action' ? submittedInputs(interaction.event.raw) : {};

  const ids = Array.from({ length: count }, (_, q) => [
    inputIds.choice(q),
    inputIds.text(q),
  ]).flat();

  return Object.fromEntries(
    ids.flatMap((id) => {
      const entry = inputs[id];

      return typeof entry === 'string' && entry ? [[id, entry]] : [];
    }),
  );
}

export async function postTargeted({
  interaction,
  text,
  thread,
}: {
  interaction: QuestionInteraction;
  text: string;
  thread: Thread;
}): Promise<void> {
  await teamsAdapter(thread).postEphemeral(thread.id, interactionUser(interaction).userId, text);
}
