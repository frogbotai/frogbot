import type { ModalSubmitEvent } from 'chat';

import type { FrogBot } from '../../frogbot.js';
import type { ChannelConversationBinding } from '../types.js';
import { handleQuestionInteraction } from './handleQuestionInteraction.js';
import { handleQuestionResult } from './handleQuestionResult.js';
import { decodeQuestionModalMetadata } from './questionModalMetadata.js';

export async function routeQuestionModalSubmit({
  binding,
  event,
  frogbot,
}: {
  binding: ChannelConversationBinding;
  event: ModalSubmitEvent;
  frogbot: FrogBot;
}): Promise<void> {
  if (!binding.questions) return;

  const locator =
    event.relatedThread && event.relatedMessage
      ? { threadId: event.relatedThread.id, messageId: event.relatedMessage.id }
      : decodeQuestionModalMetadata(event.privateMetadata);

  if (!locator) return;

  const candidates = await binding.questions.store.findByMessage(locator);

  const result = await handleQuestionInteraction({
    author: event.user,
    binding,
    candidates,
    frogbot,
    interaction: { type: 'modalSubmit', event },
    target: locator.messageId,
  });

  await handleQuestionResult({ binding, frogbot, responder: event.user, result });
}
