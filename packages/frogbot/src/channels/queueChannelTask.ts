import type { FrogBot } from '../frogbot.js';
import type { ChannelConversationBinding, ChannelTaskInput } from './types.js';

export const CHANNEL_TASK_SLUG = 'frogbot-run-channel-message';

export const CHANNEL_QUESTION_UPDATE_TASK_SLUG = 'frogbot-update-channel-question';

export async function queueChannelTask({
  binding,
  frogbot,
  input,
}: {
  binding: ChannelConversationBinding;
  frogbot: FrogBot;
  input: ChannelTaskInput;
}): Promise<void> {
  await frogbot.queue({
    task: input.kind === 'update' ? CHANNEL_QUESTION_UPDATE_TASK_SLUG : CHANNEL_TASK_SLUG,
    queue: `frogbot-channel:${binding.agent.slug}:${binding.instance.slug}`,
    input,
  });
}
