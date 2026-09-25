import type { LanguageModelUsage, UIMessage } from 'ai';

import { toHookUsage } from '../ai/hooks.js';
import type { DocID } from '../collections/config/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { generateChatTitle } from './title.js';
import { messagesConfig, persistTurnMessage } from './turn/messages.js';

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
  req: FrogBotRequest;
  chatId: DocID;
  message: UIMessage;
  history?: UIMessage[];
  mainModel?: string;
  createdAt?: string;
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
  history,
  mainModel,
  createdAt,
}: PersistAssistantMessageProps): Promise<void> {
  await persistTurnMessage({ req, chatId, message, createdAt });

  await req.frogbot.update({
    collection: messagesConfig(req).chatsSlug,
    id: chatId,
    data: { lastMessageAt: new Date().toISOString() },
    req,
    overrideAccess: true,
  });

  if (history && mainModel) {
    void generateChatTitle({
      req: await req.frogbot.createRequest({ user: req.user, context: req.context }),
      chatId,
      history,
      mainModel,
      assistantMessage: message,
    });
  }
}
