import { continueTurn } from '../../chat/turn/continueTurn.js';
import type { FrogBot } from '../../frogbot.js';
import { createChannelThreadAccess } from '../conversation.js';
import { createChannelRequest } from '../createChannelRequest.js';
import { deserializeThread } from '../deserializeThread.js';
import { postTurn } from '../postTurn.js';
import type { ChannelConversationBinding, ChannelTaskInput } from '../types.js';
import { getQuestionClientTools } from './getQuestionClientTools.js';
import { renderPendingQuestions } from './renderPendingQuestions.js';

export async function continueAfterQuestions({
  binding,
  frogbot,
  input,
  signal,
}: {
  binding: ChannelConversationBinding;
  frogbot: FrogBot;
  input: Extract<ChannelTaskInput, { kind: 'continue' }>;
  signal?: AbortSignal;
}): Promise<void> {
  const thread = deserializeThread({ binding, thread: input.thread, signal });

  const { req } = await createChannelRequest({
    author: input.responder,
    binding,
    frogbot,
    thread,
  });

  const controller = new AbortController();

  const result = await continueTurn({
    req,
    chatId: input.chatId,
    channelAccess: createChannelThreadAccess({ binding, chatId: input.chatId, req, thread }),
    clientTools: getQuestionClientTools({ binding, frogbot, thread }),
    abortSignal: AbortSignal.any([thread.signal, controller.signal]),
  });

  if ('status' in result) {
    frogbot.logger.debug(
      { chatId: input.chatId, piece: binding.instance.slug, status: result.status },
      '[frogbot] Channel question continuation skipped.',
    );

    return;
  }

  await postTurn({ thread, result, controller });
  await renderPendingQuestions({ binding, chatId: input.chatId, frogbot, thread });
}
