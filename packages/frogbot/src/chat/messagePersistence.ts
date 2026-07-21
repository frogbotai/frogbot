import type { LanguageModelUsage, UIMessage } from 'ai';

import { toHookUsage } from '../ai/hooks.js';
import type { DocID } from '../types/operations.js';
import type { FrogbotRequest } from '../types/request.js';
import { MESSAGE_USAGE_CONTEXT_KEY } from './collections/messages.js';

export type MessageUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  model?: string;
  provider?: string;
};

export type PersistAssistantMessageProps = {
  req: FrogbotRequest;
  threadId: DocID;
  message: UIMessage;
  isContinuation: boolean;
};

export function createMessageUsage(usage: LanguageModelUsage, model: string): MessageUsage | undefined {
  const tokens = toHookUsage(usage);
  if (!tokens) return undefined;

  return {
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    totalTokens: tokens.totalTokens,
    reasoningTokens: tokens.reasoningTokens,
    cachedInputTokens: tokens.cachedInputTokens,
    model,
    provider: model.split('/', 1)[0],
  };
}

export async function persistAssistantMessage({
  req,
  threadId,
  message,
  isContinuation,
}: PersistAssistantMessageProps): Promise<void> {
  const chat = req.frogbot.config.chat;
  if (!chat.enabled || !req.user) return;

  const { metadata, usage } = splitMetadata(message.metadata);
  const data = {
    thread: threadId,
    role: 'assistant',
    parts: message.parts,
    ...(metadata === undefined ? {} : { metadata }),
  };
  const context = { [MESSAGE_USAGE_CONTEXT_KEY]: usage ?? null };

  if (isContinuation) {
    await req.frogbot.update({
      collection: chat.messagesSlug,
      id: message.id,
      data,
      context,
      req,
      overrideAccess: false,
    });
  } else {
    await req.frogbot.create({
      collection: chat.messagesSlug,
      data: { id: message.id, ...data },
      context,
      req,
      overrideAccess: false,
    });
  }

  await req.frogbot.update({
    collection: chat.threadsSlug,
    id: threadId,
    data: { lastMessageAt: new Date().toISOString() },
    req,
    overrideAccess: false,
  });
}

function splitMetadata(metadata: unknown): { metadata?: unknown; usage?: MessageUsage } {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return { metadata };

  const { usage, ...rest } = metadata as Record<string, unknown> & { usage?: MessageUsage };
  return {
    ...(Object.keys(rest).length === 0 ? {} : { metadata: rest }),
    ...(usage === undefined ? {} : { usage }),
  };
}
