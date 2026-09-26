import type { Thread } from 'chat';

import type { ClientToolsOption } from '../../chat/turn/types.js';
import type { FrogBot } from '../../frogbot.js';
import type { ChannelConversationBinding } from '../types.js';

export function getQuestionClientTools({
  binding,
  frogbot,
  thread,
}: {
  binding: ChannelConversationBinding;
  frogbot: FrogBot;
  thread: Thread;
}): ClientToolsOption {
  const hooks = binding.questions?.hooks;

  if (!hooks) return { kinds: [] };

  try {
    return hooks.supports?.({ thread }) === false ? { kinds: [] } : { kinds: ['question'] };
  } catch (error) {
    frogbot.logger.error(
      { err: error, piece: binding.instance.slug, thread: thread.id },
      '[frogbot] Channel question support check failed; questions are disabled for this turn.',
    );

    return { kinds: [] };
  }
}
