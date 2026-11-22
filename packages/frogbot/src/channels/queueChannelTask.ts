import type { FrogBot } from '../frogbot.js';
import type { ChannelConversationBinding, ChannelTaskInput } from './types.js';

export const CHANNEL_TASK_SLUG = 'frogbot-run-channel-message';

export const CHANNEL_QUESTION_UPDATE_TASK_SLUG = 'frogbot-update-channel-question';

/** The queue an agent's messages from one channel run on. */
export function channelQueue(agentSlug: string, instanceSlug: string): string {
  return `frogbot-channel:${agentSlug}:${instanceSlug}`;
}

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
    queue: channelQueue(binding.agent.slug, binding.instance.slug),
    input,
    overrideAccess: true,
  });
}
