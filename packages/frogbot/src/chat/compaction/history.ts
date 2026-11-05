import type { UIMessage } from 'ai';

import type { AgentModelMessagesProps } from '../../uploads/toAgentModelMessages.js';
import { toAgentModelMessages } from '../../uploads/toAgentModelMessages.js';
import { checkpointMessage } from './checkpoint.js';
import type { CompactedHistory } from './split.js';
import { lastIndex } from './split.js';

export type CompactionPartData = {
  status: 'running' | 'completed' | 'failed';
  reason: 'auto' | 'manual';
  summary?: string;
  error?: string;
  tokens?: { input: number; output: number };
  /** The ID of the first message kept whole after the summary. */
  keepFrom?: string;
};

export type CompactionPart = { type: 'data-compaction'; id: string; data: CompactionPartData };

type UIPart = UIMessage['parts'][number];

export function isCompactionPart(part: UIPart): part is CompactionPart {
  return part.type === 'data-compaction' && 'id' in part && typeof part.id === 'string';
}

/**
 * The part of a chat the model sees: from the latest completed compaction, its checkpoint, then
 * the messages from its `keepFrom` on. Messages that hold only compaction parts are left out.
 */
export function compactedHistory(messages: readonly UIMessage[]): CompactedHistory {
  const latest = latestCompaction(messages);
  const visible = (list: readonly UIMessage[]) =>
    list.filter((message) => !onlyCompaction(message));

  if (!latest) return { messages: visible(messages) };

  const { index, part } = latest;
  const keepFrom = messages.findIndex(({ id }) => id === part.data.keepFrom);

  return {
    checkpoint: checkpointMessage({ id: part.id, summary: part.data.summary! }),
    messages: visible(messages.slice(keepFrom >= 0 && keepFrom <= index ? keepFrom : index)),
  };
}

export function withCheckpoint({ checkpoint, messages }: CompactedHistory): UIMessage[] {
  return checkpoint ? [checkpoint, ...messages] : messages;
}

/**
 * The IDs of the messages stored before the one holding the latest completed compaction. Their
 * measured prompt tokens still count what that compaction summarized.
 */
export function beforeLatestCompaction(messages: readonly UIMessage[]): Set<string> {
  const latest = latestCompaction(messages);

  return new Set(latest ? messages.slice(0, latest.index).map(({ id }) => id) : []);
}

/** `toAgentModelMessages` for a chat turn: the model input starts at the latest checkpoint. */
export function toCompactedModelMessages(props: AgentModelMessagesProps) {
  return toAgentModelMessages({
    ...props,
    messages: withCheckpoint(compactedHistory(props.messages)),
  });
}

function latestCompaction(
  messages: readonly UIMessage[],
): { index: number; part: CompactionPart } | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];

    if (message.role !== 'assistant') continue;

    const found = lastIndex(
      message.parts,
      (candidate) =>
        isCompactionPart(candidate) &&
        candidate.data.status === 'completed' &&
        typeof candidate.data.summary === 'string' &&
        candidate.data.summary.length > 0,
    );

    if (found >= 0) return { index, part: message.parts[found] as CompactionPart };
  }

  return undefined;
}

function onlyCompaction(message: UIMessage): boolean {
  return (
    message.parts.length > 0 &&
    message.parts.every((part) => part.type === 'step-start' || isCompactionPart(part))
  );
}
