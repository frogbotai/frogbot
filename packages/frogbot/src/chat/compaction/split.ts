import type { UIMessage } from 'ai';

import { estimateUIMessages } from './estimate.js';

/** A chat's model history: the latest checkpoint, then the messages after it. */
export type CompactedHistory = {
  checkpoint?: UIMessage;
  messages: UIMessage[];
};

export type CompactionSplit = {
  /** Messages to summarize, the previous checkpoint first. Empty when there is nothing to compact. */
  older: UIMessage[];
  /** Messages kept whole after the checkpoint, from `keepFrom` on. */
  kept: UIMessage[];
  /** The ID of the user message the kept messages start at. */
  keepFrom?: string;
};

/**
 * Keeps the newest messages within `keep` tokens, starting at a user message so a reply stays with
 * its tool calls and results, and always keeps the latest exchange. Everything older is summarized.
 */
export function splitHistory(
  { checkpoint, messages }: CompactedHistory,
  keep: number,
): CompactionSplit {
  const sizes = messages.map((message) => estimateUIMessages([message]));
  const dropped = Math.min(oldestToKeep(sizes, keep), messages.length - 1);
  const boundary = lastIndex(messages, (message, index) => index <= dropped && isUser(message));
  const start = boundary > 0 ? boundary : lastIndex(messages, isUser);

  if (start <= 0) return { older: [], kept: [...messages] };

  return {
    older: [...(checkpoint ? [checkpoint] : []), ...messages.slice(0, start)],
    kept: messages.slice(start),
    keepFrom: messages[start].id,
  };
}

export function lastIndex<T>(
  items: readonly T[],
  test: (item: T, index: number) => boolean,
): number {
  for (let index = items.length - 1; index >= 0; index--) {
    if (test(items[index], index)) return index;
  }

  return -1;
}

function isUser(message: UIMessage): boolean {
  return message.role === 'user';
}

function oldestToKeep(sizes: readonly number[], budget: number): number {
  let total = 0;
  let start = sizes.length;

  while (start > 0) {
    const next = total + sizes[start - 1];

    if (next > budget) break;

    total = next;
    start--;
  }

  return start;
}
