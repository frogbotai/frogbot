import type { LanguageModelUsage, UIMessage } from 'ai';

import { toHookUsage } from '../ai/hooks.js';
import type { DocID } from '../collections/config/types.js';
import type { FrogbotRequest } from '../types/request.js';
import { MESSAGE_USAGE_CONTEXT_KEY } from './collections/messages.js';
import { generateChatTitle } from './title.js';

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
  chatId: DocID;
  message: UIMessage;
  isContinuation: boolean;
  history?: UIMessage[];
  mainModel?: string;
};

export function createMessageUsage(
  usage: LanguageModelUsage,
  model: string,
): MessageUsage | undefined {
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
  chatId,
  message,
  isContinuation,
  history,
  mainModel,
}: PersistAssistantMessageProps): Promise<void> {
  const chat = req.frogbot.config.chat;
  if (!chat.enabled) return;

  const overrideAccess = true;

  const { metadata, usage } = splitMetadata(message.metadata);
  const data = {
    chat: chatId,
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
      overrideAccess,
    });
  } else {
    await req.frogbot.create({
      collection: chat.messagesSlug,
      data: { id: message.id, ...data },
      context,
      req,
      overrideAccess,
    });
  }

  await req.frogbot.update({
    collection: chat.chatsSlug,
    id: chatId,
    data: { lastMessageAt: new Date().toISOString() },
    req,
    overrideAccess,
  });

  if (history && mainModel) {
    void generateChatTitle({
      req,
      chatId,
      history,
      mainModel,
      assistantMessage: message,
    });
  }
}

function splitMetadata(metadata: unknown): { metadata?: unknown; usage?: MessageUsage } {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return { metadata };

  const { usage, ...rest } = metadata as Record<string, unknown> & { usage?: MessageUsage };
  return {
    ...(Object.keys(rest).length === 0 ? {} : { metadata: rest }),
    ...(usage === undefined ? {} : { usage }),
  };
}
