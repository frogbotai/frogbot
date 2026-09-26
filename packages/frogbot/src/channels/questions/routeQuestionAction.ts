import type { ActionEvent } from 'chat';

import type { FrogBot } from '../../frogbot.js';
import type { ChannelConversationBinding } from '../types.js';
import { handleQuestionInteraction } from './handleQuestionInteraction.js';
import { handleQuestionResult } from './handleQuestionResult.js';

export async function routeQuestionAction({
  binding,
  event,
  frogbot,
}: {
  binding: ChannelConversationBinding;
  event: ActionEvent;
  frogbot: FrogBot;
}): Promise<void> {
  if (!binding.questions || !event.threadId || !event.messageId) return;

  const candidates = await binding.questions.store.findByMessage({
    threadId: event.threadId,
    messageId: event.messageId,
  });

  const result = await handleQuestionInteraction({
    author: event.user,
    binding,
    candidates,
    frogbot,
    interaction: { type: 'action', event },
    target: event.messageId,
  });

  await handleQuestionResult({ binding, frogbot, responder: event.user, result });
}
