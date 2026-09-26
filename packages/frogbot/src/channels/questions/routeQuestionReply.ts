import type { Message as ChatMessage } from 'chat';

import type { DocID } from '../../collections/config/types.js';
import type { FrogBot } from '../../frogbot.js';
import type { ChannelConversationBinding } from '../types.js';
import type {
  AuthorizedChannelRequest,
  QuestionInteractionResult,
} from './handleQuestionInteraction.js';
import { handleQuestionInteraction } from './handleQuestionInteraction.js';
import { handleQuestionResult } from './handleQuestionResult.js';

export async function routeQuestionReply({
  binding,
  chatId,
  frogbot,
  message,
  request,
}: {
  binding: ChannelConversationBinding;
  chatId: DocID;
  frogbot: FrogBot;
  message: ChatMessage;
  request: AuthorizedChannelRequest;
}): Promise<QuestionInteractionResult> {
  if (!binding.questions) return { status: 'ignored' };

  const candidates = await binding.questions.store.findByChat({ chatId });

  const result = await handleQuestionInteraction({
    author: message.author,
    binding,
    candidates,
    frogbot,
    interaction: { type: 'message', message },
    request,
  });

  await handleQuestionResult({ binding, frogbot, responder: message.author, result });

  return result;
}
