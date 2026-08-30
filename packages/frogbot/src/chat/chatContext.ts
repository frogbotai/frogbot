import type { UIMessage } from 'ai';
import { commitTransaction, initTransaction, killTransaction, NotFound } from 'payload';

import type { DocID } from '../collections/config/types.js';
import type { FrogbotRequest } from '../types/request.js';
import { messagesToUIMessages } from './messagesToUIMessages.js';
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
      const existing =
        chatId === undefined
          ? undefined
          : (
              (await req.frogbot.find({
                collection: chat.messagesSlug,
                where: {
                  and: [{ id: { equals: message.id } }, { chat: { equals: resolvedChatId } }],
                },
                limit: 1,
                depth: 0,
                req,
                overrideAccess,
              })) as unknown as { docs: Array<{ id: DocID; createdAt: string }> }
            ).docs[0];

      if (existing) {
        await req.frogbot.update({
          collection: chat.messagesSlug,
          id: existing.id,
          data: { parts: message.parts, metadata: message.metadata },
          req,
          overrideAccess,
        });
        await req.frogbot.delete({
          collection: chat.messagesSlug,
          where: {
            and: [
              { chat: { equals: resolvedChatId } },
              { createdAt: { greater_than: existing.createdAt } },
            ],
          },
          req,
          overrideAccess,
        });
      } else {
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

  const uiMessages = await validateChatMessages(
    messagesToUIMessages(history.docs as never),
    tools as never,
  );

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
    })) as { id: DocID; user?: { id: DocID } | DocID | null };
    const ownerId = typeof chat.user === 'object' && chat.user !== null ? chat.user.id : chat.user;
    if ((ownerId ?? null) !== (req.user?.id ?? null)) throw new NotFound(req.t);
    return chat.id;
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
