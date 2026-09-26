import type { FrogBot } from '../../frogbot.js';
import { createInternalChannelRequest } from '../createChannelRequest.js';
import { deserializeThread } from '../deserializeThread.js';
import type { ChannelConversationBinding, ChannelTaskInput } from '../types.js';
import { applyQuestionChange, toQuestionRecord } from './questionRecord.js';

export async function runQuestionUpdate({
  binding,
  frogbot,
  input,
  signal,
}: {
  binding: ChannelConversationBinding;
  frogbot: FrogBot;
  input: Extract<ChannelTaskInput, { kind: 'update' }>;
  signal?: AbortSignal;
}): Promise<void> {
  const questions = binding.questions;

  if (!questions) return;

  const reference = { chatId: input.chatId, toolCallId: input.toolCallId };

  await questions.store.lock(reference, async () => {
    const question = await questions.store.find(reference);

    if (
      !question ||
      question.settled ||
      question.pending !== 'update' ||
      question.revision !== input.revision
    ) {
      return;
    }

    const thread = deserializeThread({ binding, thread: question.thread, signal });
    const { client, req } = await createInternalChannelRequest({ binding, frogbot });

    const change = await questions.hooks.updated?.({
      call: question.call,
      client,
      question: toQuestionRecord(question),
      req,
      thread,
    });

    await questions.store.change({
      expected: question.revision,
      question: applyQuestionChange({ change, question }),
    });
  });
}
