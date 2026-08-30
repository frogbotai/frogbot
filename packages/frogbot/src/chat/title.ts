import type { UIMessage } from 'ai';

import { getAgent } from '../agents/service.js';
import { resolveSmallModel } from '../ai/models.js';
import { resolveModel } from '../ai/resolve.js';
import type { ModelId } from '../ai/types.js';
import type { DocID } from '../collections/config/types.js';
import type { FrogbotRequest } from '../types/request.js';
import { firstUserText } from './firstUserText.js';
import { messagesToUIMessages, type PersistedMessage } from './messagesToUIMessages.js';

type SuggestChatTitleProps = {
  req: FrogbotRequest;
  history: UIMessage[];
  mainModel: string;
};

type GenerateChatTitleProps = SuggestChatTitleProps & {
  chatId: DocID;
  assistantMessage: UIMessage;
};

type ChatDocument = {
  id?: DocID;
  agent?: string | null;
  title?: string | null;
  user?: { id: DocID } | DocID | null;
};

export async function suggestChatTitleForChat({
  req,
  chatId,
}: {
  req: FrogbotRequest;
  chatId: DocID;
}): Promise<string | undefined> {
  const config = req.frogbot.config.chat;
  if (!config.enabled) return undefined;
  const chat = (await req.frogbot.findByID({
    collection: config.chatsSlug,
    id: chatId,
    depth: 0,
    req,
    overrideAccess: false,
  })) as ChatDocument;
  const owner = typeof chat.user === 'object' && chat.user !== null ? chat.user.id : chat.user;
  if (owner === undefined || owner === null || String(owner) !== String(req.user?.id)) {
    return undefined;
  }
  const messages = (await req.frogbot.find({
    collection: config.messagesSlug,
    where: { chat: { equals: chatId } },
    sort: ['createdAt', 'id'],
    pagination: false,
    depth: 0,
    req,
    overrideAccess: false,
  })) as unknown as { docs: PersistedMessage[] };
  const agent = getAgent({ req, slug: chat.agent ?? undefined });
  try {
    return await suggestChatTitle({
      req,
      history: messagesToUIMessages(messages.docs),
      mainModel: resolveModel(agent.config.model, req.frogbot.config.ai!),
    });
  } catch (error) {
    req.frogbot.logger.error({ err: error, chatId }, '[frogbot] Failed to suggest chat title');
    return undefined;
  }
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function cleanTitle(text: string): string | undefined {
  const title = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/^(["'`]|#+\s*)|(["'`])$/g, '')
    .trim();
  if (!title) return undefined;
  return title.length > 100 ? `${title.slice(0, 99).trimEnd()}…` : title;
}

export async function suggestChatTitle({
  req,
  history,
  mainModel,
}: SuggestChatTitleProps): Promise<string | undefined> {
  const conversation = history
    .map((message) => `${message.role}: ${messageText(message)}`)
    .filter((line) => !line.endsWith(': '))
    .join('\n');
  if (!conversation) return undefined;
  const result = await req.frogbot.generateText({
    model: resolveSmallModel(req.frogbot.config.ai!, mainModel) as ModelId,
    req,
    overrideAccess: true,
    instructions:
      'Create a concise chat title in the same language as the user. Return only one plain-text line, ideally 50 characters or fewer. Do not use quotes, markdown, or punctuation at the end.',
    prompt: conversation,
    maxOutputTokens: 40,
  });
  return cleanTitle(result.text);
}

export async function generateChatTitle({
  req,
  chatId,
  history,
  mainModel,
  assistantMessage,
}: GenerateChatTitleProps): Promise<void> {
  if (history.some((message) => message.role === 'assistant')) return;
  const config = req.frogbot.config.chat;
  if (!config.enabled) return;
  try {
    const chat = (await req.frogbot.findByID({
      collection: config.chatsSlug,
      id: chatId,
      depth: 0,
      req,
      overrideAccess: true,
    })) as ChatDocument;
    if (chat.title?.trim()) return;
    let title: string | undefined;
    try {
      title = await suggestChatTitle({
        req,
        history: [...history, assistantMessage],
        mainModel,
      });
    } catch (error) {
      req.frogbot.logger.error({ err: error, chatId }, '[frogbot] Failed to suggest chat title');
    }
    title ??= firstUserText(history)?.slice(0, 100).trimEnd();
    if (!title) return;
    const current = (await req.frogbot.findByID({
      collection: config.chatsSlug,
      id: chatId,
      depth: 0,
      req,
      overrideAccess: true,
    })) as ChatDocument;
    if (current.title?.trim()) return;
    await req.frogbot.update({
      collection: config.chatsSlug,
      id: chatId,
      data: { title },
      req,
      overrideAccess: true,
    });
  } catch (error) {
    req.frogbot.logger.error({ err: error, chatId }, '[frogbot] Failed to generate chat title');
  }
}
