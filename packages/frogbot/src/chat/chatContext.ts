import type { UIMessage } from 'ai';
import { commitTransaction, initTransaction, killTransaction, NotFound } from 'payload';

import type { DocID } from '../types/operations.js';
import type { FrogbotRequest } from '../types/request.js';
import { validateChatMessages } from './validateMessages.js';

export type ChatContext = {
  chatId?: DocID;
  uiMessages: UIMessage[];
};

export type ResolveChatContextProps = {
  req: FrogbotRequest;
  agentSlug: string;
  chatId?: DocID;
  incoming: UIMessage[];
  tools: unknown;
};

type TransactionReq = Parameters<typeof initTransaction>[0];

export async function resolveChatContext({
  req,
  agentSlug,
  chatId,
  incoming,
  tools,
}: ResolveChatContextProps): Promise<ChatContext> {
  const chat = req.frogbot.config.chat;
  if (!chat.enabled) return { uiMessages: incoming };

  const overrideAccess = true;

  const newMessages = chatId !== undefined ? incoming.slice(-1) : incoming;
  if (newMessages.length === 0) {
    throw Object.assign(new Error('At least one user message is required'), { status: 400 });
  }
  if (newMessages.some((message) => message.role !== 'user')) {
    throw Object.assign(new Error('Only user messages can be submitted'), { status: 400 });
  }
  const transactionReq = req as unknown as TransactionReq;
  const ownsTransaction = await initTransaction(transactionReq);

  let resolvedChatId: DocID;
  try {
    resolvedChatId = await resolveChatId({
      req,
      agentSlug,
      chatId,
      chatsSlug: chat.chatsSlug,
    });

    for (const message of newMessages) {
      await req.frogbot.create({
        collection: chat.messagesSlug,
        data: {
          id: message.id,
          chat: resolvedChatId,
          role: message.role,
          parts: message.parts,
          metadata: message.metadata,
        },
        req,
        overrideAccess,
      });
    }

    if (ownsTransaction) await commitTransaction(transactionReq);
  } catch (error) {
    if (ownsTransaction) await killTransaction(transactionReq);
    throw error;
  }

  const history = await req.frogbot.find({
    collection: chat.messagesSlug,
    where: { chat: { equals: resolvedChatId } },
    sort: ['createdAt', 'id'],
    pagination: false,
    depth: 0,
    req,
    overrideAccess,
  });

  const uiMessages = await validateChatMessages(history.docs.map(toUIMessage), tools as never);

  return { chatId: resolvedChatId, uiMessages };
}

type ResolveChatIdProps = {
  req: FrogbotRequest;
  agentSlug: string;
  chatId?: DocID;
  chatsSlug: string;
};

async function resolveChatId({
  req,
  agentSlug,
  chatId,
  chatsSlug,
}: ResolveChatIdProps): Promise<DocID> {
  const overrideAccess = true;
  if (chatId !== undefined) {
    const chat = (await req.frogbot.findByID({
      collection: chatsSlug,
      id: chatId,
      depth: 0,
      req,
      overrideAccess,
    })) as { user?: { id: DocID } | DocID | null };
    const ownerId =
      typeof chat.user === 'object' && chat.user !== null ? chat.user.id : chat.user;
    if ((ownerId ?? null) !== (req.user?.id ?? null)) throw new NotFound(req.t);
    return chatId;
  }

  const chat = await req.frogbot.create({
    collection: chatsSlug,
    data: {
      user: req.user?.id ?? null,
      agent: agentSlug,
    },
    req,
    overrideAccess,
  });
  return chat.id;
}

function toUIMessage(doc: unknown): UIMessage {
  const message = doc as {
    id: DocID;
    role: UIMessage['role'];
    parts: UIMessage['parts'];
    metadata?: unknown;
  };
  return {
    id: String(message.id),
    role: message.role,
    parts: message.parts,
    ...(message.metadata == null ? {} : { metadata: message.metadata }),
  };
}
