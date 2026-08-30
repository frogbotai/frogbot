import { generateId } from 'ai';
import { commitTransaction, initTransaction, killTransaction, NotFound } from 'payload';

import type { DocID } from '../collections/config/types.js';
import type { FrogbotRequest } from '../types/request.js';
import { MESSAGE_USAGE_CONTEXT_KEY } from './collections/messages.js';

export type BranchChatProps = {
  req: FrogbotRequest;
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
  usage?: unknown;
  createdAt: string;
};

type TransactionReq = Parameters<typeof initTransaction>[0];

function relationID(value: { id: DocID } | DocID | null | undefined): DocID | null {
  return typeof value === 'object' && value !== null ? value.id : (value ?? null);
}

function firstUserText(messages: MessageDocument[]): string | undefined {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    for (const part of message.parts) {
      if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
        const text = part.text.trim();
        return text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text;
      }
    }
  }
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
  req: FrogbotRequest;
  chatsSlug: string;
  ownerId: DocID;
  sourceTitle: string;
}): Promise<string> {
  const base = duplicateBase(sourceTitle) || 'New chat';
  const chats = (await req.frogbot.find({
    collection: chatsSlug,
    where: { user: { equals: ownerId } },
    pagination: false,
    depth: 0,
    req,
    overrideAccess: true,
  })) as unknown as { docs: Array<{ title?: string | null }> };
  let next = 1;
  for (const chat of chats.docs) {
    const title = chat.title?.trim();
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

  const sourceMessages = (await req.frogbot.find({
    collection: config.messagesSlug,
    where: { chat: { equals: source.id } },
    sort: ['createdAt', 'id'],
    pagination: false,
    depth: 0,
    req,
    overrideAccess: false,
  })) as unknown as { docs: MessageDocument[] };
  const selectedIndex = sourceMessages.docs.findIndex(
    (message) => String(message.id) === String(messageId),
  );
  if (selectedIndex === -1) throw new NotFound(req.t);
  const messages = sourceMessages.docs.slice(0, selectedIndex + 1);
  const sourceTitle = source.title?.trim() || firstUserText(messages) || 'New chat';

  const transactionReq = req as unknown as TransactionReq;
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
          parts: message.parts,
          metadata: message.metadata,
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
