import type { Thread } from 'chat';

import { listPendingCalls } from '../../chat/turn/settle.js';
import type { PendingCall } from '../../chat/turn/types.js';
import type { DocID } from '../../collections/config/types.js';
import type { FrogBot } from '../../frogbot.js';
import { pieceInstanceRuntime } from '../../pieces/definePiece.js';
import { QuestionInput } from '../../tools/question.js';
import { isClientTool } from '../../tools/types.js';
import { createChannelThreadAccess } from '../conversation.js';
import { serializeThread } from '../deserializeThread.js';
import type { ChannelConversationBinding } from '../types.js';
import type { ChannelQuestionCall, StoredQuestion } from './types.js';

export async function renderPendingQuestions({
  binding,
  chatId,
  frogbot,
  thread,
}: {
  binding: ChannelConversationBinding;
  chatId: DocID;
  frogbot: FrogBot;
  thread: Thread;
}): Promise<void> {
  const questions = binding.questions;

  if (!questions) return;

  const req = await frogbot.createRequest({});
  const channelAccess = createChannelThreadAccess({ binding, chatId, req, thread });

  const calls = (await listPendingCalls({ req, chatId, channelAccess })).flatMap((call) =>
    toQuestionCall({ binding, call }),
  );

  const existing = await Promise.all(
    calls.map(({ toolCallId }) => questions.store.find({ chatId, toolCallId })),
  );

  if (existing.some((question) => question && !question.settled)) return;

  const claimed: ChannelQuestionCall[] = [];

  for (const call of calls) {
    if (await questions.store.claim({ chatId, toolCallId: call.toolCallId })) {
      claimed.push(call);
    }
  }

  if (claimed.length === 0) return;

  const release = (calls: ChannelQuestionCall[]) =>
    Promise.all(calls.map(({ toolCallId }) => questions.store.release({ chatId, toolCallId })));

  const serialized = serializeThread(thread);
  const byId = new Map(claimed.map((call) => [call.toolCallId, call]));

  try {
    const client = await pieceInstanceRuntime(binding.instance).client({ req });
    const rendered = await questions.hooks.render({ calls: claimed, client, req, thread });

    const saved = rendered.flatMap(({ calls: covered, messages, state }) =>
      covered.flatMap((toolCallId): StoredQuestion[] => {
        const call = byId.get(toolCallId);

        if (!call) return [];

        byId.delete(toolCallId);

        return [
          {
            call,
            chatId,
            messages,
            revision: 0,
            thread: serialized,
            ...(state === undefined ? {} : { state }),
          },
        ];
      }),
    );

    await questions.store.save({ questions: saved });
  } catch (error) {
    await release(claimed);

    throw error;
  }

  await release([...byId.values()]);
}

function toQuestionCall({
  binding,
  call,
}: {
  binding: ChannelConversationBinding;
  call: PendingCall;
}): ChannelQuestionCall[] {
  const tool = (binding.agent.config.tools ?? []).find(
    (candidate) => isClientTool(candidate) && candidate.slug === call.toolName,
  );

  if (!tool || !isClientTool(tool) || tool.client.kind !== 'question') return [];

  const input = QuestionInput.safeParse(call.input);

  return input.success ? [{ ...call, input: input.data }] : [];
}
