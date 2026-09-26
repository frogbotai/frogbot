import type { Author } from 'chat';

import type { FrogBot } from '../../frogbot.js';
import { deserializeThread } from '../deserializeThread.js';
import { queueChannelTask } from '../queueChannelTask.js';
import type { ChannelConversationBinding } from '../types.js';
import type { QuestionInteractionResult } from './handleQuestionInteraction.js';
import { renderPendingQuestions } from './renderPendingQuestions.js';

export async function handleQuestionResult({
  binding,
  frogbot,
  responder,
  result,
}: {
  binding: ChannelConversationBinding;
  frogbot: FrogBot;
  responder: Author;
  result: QuestionInteractionResult;
}): Promise<void> {
  if (result.status !== 'settled' || result.dismissed) return;

  const { question } = result;

  if (!result.allSettled) {
    await renderPendingQuestions({
      binding,
      chatId: question.chatId,
      frogbot,
      thread: deserializeThread({ binding, thread: question.thread }),
    });

    return;
  }

  await queueChannelTask({
    binding,
    frogbot,
    input: {
      kind: 'continue',
      agentSlug: binding.agent.slug,
      instanceSlug: binding.instance.slug,
      chatId: question.chatId,
      thread: question.thread,
      responder,
    },
  });
}
