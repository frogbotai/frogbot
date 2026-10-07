import type { UIMessage } from 'ai';
import { generateId } from 'ai';
import { commitTransaction, initTransaction, killTransaction, NotFound } from 'payload';

import type { DocID } from '../collections/config/types.js';
import { toPayloadRequest } from '../seams/request.js';
import type { FrogBotRequest } from '../types/request.js';
import { MESSAGE_USAGE_CONTEXT_KEY } from './collections/messages.js';
import { placeholderChatTitle } from './title.js';
import { repairInterruptedParts } from './turn/messages.js';

export type BranchChatProps = {
  req: FrogBotRequest;
  chatId: DocID;
  messageId: DocID;
};

export type BranchChatResult = {
  chatId: DocID;
};

type ChatDocument = {
  id: DocID;
  title?: string | null;
  user?: { id: DocID } | DocID | null;
  agent?: string | null;
};

type MessageDocument = {
  id: DocID;
  role: 'assistant' | 'system' | 'user';
  parts: Array<Record<string, unknown>>;
  metadata?: unknown;
  model?: string | null;
  reasoning?: string | null;
  usage?: unknown;
  createdAt: string;
};

function relationID(value: { id: DocID } | DocID | null | undefined): DocID | null {
  return typeof value === 'object' && value !== null ? value.id : (value ?? null);
}

function duplicateBase(title: string): string {
  return title.replace(/ \((\d+)\)$/, '').trim();
}

async function duplicateTitle({
  req,
  chatsSlug,
  ownerId,
  sourceTitle,
}: {
  req: FrogBotRequest;
  chatsSlug: string;
  ownerId: DocID;
  sourceTitle: string;
}): Promise<string> {
  const base = duplicateBase(sourceTitle) || 'New chat';
  const chats = await req.frogbot.find({
    collection: chatsSlug,
    where: { user: { equals: ownerId } },
    pagination: false,
    depth: 0,
    req,
    overrideAccess: true,
  });

  let next = 1;

  for (const chat of chats.docs) {
    const title = typeof chat.title === 'string' ? chat.title.trim() : undefined;
    const match = title?.match(/^(.*) \((\d+)\)$/);
    if (match?.[1] === base) next = Math.max(next, Number(match[2]) + 1);
  }

  return `${base} (${next})`;
}

export async function branchChat({
  req,
  chatId,
  messageId,
}: BranchChatProps): Promise<BranchChatResult> {
  const config = req.frogbot.config.chat;
  if (!config.enabled) throw new NotFound(req.t);

  const source = (await req.frogbot.findByID({
    collection: config.chatsSlug,
    id: chatId,
    depth: 0,
    req,
    overrideAccess: false,
  })) as ChatDocument;

  const ownerId = relationID(source.user);
  if (ownerId === null || ownerId !== req.user?.id) throw new NotFound(req.t);

  const sourceMessages = await req.frogbot.find({
    collection: config.messagesSlug,
    where: { and: [{ chat: { equals: source.id } }, { status: { not_equals: 'queued' } }] },
    sort: ['createdAt', 'id'],
    pagination: false,
    depth: 0,
    req,
    overrideAccess: false,
  });

  const sourceDocs = sourceMessages.docs as MessageDocument[];
  const selectedIndex = sourceDocs.findIndex((message) => String(message.id) === String(messageId));
  if (selectedIndex === -1) throw new NotFound(req.t);
  const messages = sourceDocs.slice(0, selectedIndex + 1);
  const sourceTitle = source.title?.trim() || placeholderChatTitle(messages) || 'New chat';

  const transactionReq = toPayloadRequest(req);
  const ownsTransaction = await initTransaction(transactionReq);
  try {
    const title = await duplicateTitle({
      req,
      chatsSlug: config.chatsSlug,
      ownerId,
      sourceTitle,
    });

    const chat = await req.frogbot.create({
      collection: config.chatsSlug,
      data: {
        title,
        user: ownerId,
        agent: source.agent,
        lastMessageAt: new Date().toISOString(),
      },
      depth: 0,
      req,
      overrideAccess: true,
    });

    const idPrefix = `branch-${generateId()}`;
    const width = String(messages.length - 1).length;

    for (const [index, message] of messages.entries()) {
      await req.frogbot.create({
        collection: config.messagesSlug,
        data: {
          id: `${idPrefix}-${String(index).padStart(width, '0')}`,
          chat: chat.id,
          role: message.role,
          parts: repairInterruptedParts(message.parts as UIMessage['parts']),
          metadata: message.metadata,
          model: message.model ?? null,
          reasoning: message.reasoning ?? null,
        },
        context: { [MESSAGE_USAGE_CONTEXT_KEY]: message.usage ?? null },
        depth: 0,
        req,
        overrideAccess: true,
      });
    }

    if (ownsTransaction) await commitTransaction(transactionReq);

    return { chatId: chat.id };
  } catch (error) {
    if (ownsTransaction) await killTransaction(transactionReq);
    throw error;
  }
}
