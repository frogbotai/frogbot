import type { Message as ChatMessage, SerializedThread, Thread } from 'chat';
import { Message, ThreadImpl } from 'chat';

import type { ChannelBinding, ChannelThreadReference } from './types.js';

export function deserializeThread({
  binding,
  currentMessage,
  signal,
  thread,
}: {
  binding: ChannelBinding;
  currentMessage?: ChatMessage;
  signal?: AbortSignal;
  thread: SerializedThread | ChannelThreadReference['thread'];
}): Thread {
  const serialized = 'currentMessage' in thread ? thread.currentMessage : undefined;

  return new ThreadImpl({
    id: thread.id,
    channelId: thread.channelId,
    channelVisibility: thread.channelVisibility,
    isDM: thread.isDM,
    currentMessage: serialized ? Message.fromJSON(serialized) : currentMessage,
    adapter: binding.adapter,
    stateAdapter: binding.chat.getState(),
    signal,
  });
}

export function serializeThread(thread: Thread): ChannelThreadReference['thread'] {
  const { currentMessage: _currentMessage, ...serialized } = thread.toJSON();

  return serialized;
}
