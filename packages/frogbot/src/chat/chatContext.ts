import type { UIMessage } from 'ai';
import { commitTransaction, initTransaction, killTransaction } from 'payload';

import type { DocID } from '../collections/config/types.js';
import type { FrogBotRequest } from '../types/request.js';
import type { ChannelChatAccess } from './channelAccess.js';
import type { ChatDocument } from './findChat.js';
import { findChat } from './findChat.js';
import { actorFromRequest } from './turn/actor.js';
import { TurnError } from './turn/errors.js';
import {
  findTurnMessage,
  getPendingCalls,
  isToolPart,
  loadChatHistory,
  messagesConfig,
} from './turn/messages.js';
import { settleCall } from './turn/settle.js';
import { claimTurn, releaseTurn } from './turn/state.js';
import type { MessageDelivery, TurnClaim } from './turn/types.js';

export type ChatContext =
  | { status: 'ready'; chatId: DocID; uiMessages: UIMessage[]; claim: TurnClaim }
  | { status: 'queued'; chatId: DocID; messageId: string; delivery: MessageDelivery };

export type ResolveChatContextProps = {
  req: FrogBotRequest;
  agentSlug: string;
  chatId?: DocID;
  incoming: UIMessage[];
  tools: unknown;
  channelAccess?: ChannelChatAccess;
  delivery?: MessageDelivery;
  queue?: boolean;
};

type TransactionReq = Parameters<typeof initTransaction>[0];

export async function resolveChatContext({
  req,
  agentSlug,
  chatId,
  incoming,
  tools,
  channelAccess,
  delivery = 'queue',
  queue = true,
}: ResolveChatContextProps): Promise<ChatContext> {
  const newMessages = chatId !== undefined ? incoming.slice(-1) : incoming;
  const last = newMessages.at(-1);

  if (!last) {
    throw Object.assign(new Error('At least one user message is required'), { status: 400 });
  }

  if (last.role === 'assistant' && chatId !== undefined) {
    const chat = await findChat({ req, agentSlug, chatId, channelAccess });

    return resumeChat({ req, agentSlug, chat, message: last, tools });
  }

  if (newMessages.some((message) => message.role !== 'user')) {
    throw Object.assign(new Error('Only user messages can be submitted'), { status: 400 });
  }

  const resolvedChatId =
    chatId === undefined
      ? await createChat({ req, agentSlug })
      : (await findChat({ req, agentSlug, chatId, channelAccess })).id;

  const claim = await claimTurn({ req, chatId: resolvedChatId, from: 'idle' });

  if (!claim) {
    if (!queue) {
      throw new TurnError('turn-in-progress', 'This chat already has a turn in progress.');
    }

    await persistIncoming({ req, chatId: resolvedChatId, messages: [last], delivery });

    return { status: 'queued', chatId: resolvedChatId, messageId: last.id, delivery };
  }

  try {
    await persistIncoming({ req, chatId: resolvedChatId, messages: newMessages });

    const uiMessages = await loadChatHistory({ req, chatId: resolvedChatId, tools });

    return { status: 'ready', chatId: resolvedChatId, uiMessages, claim };
  } catch (error) {
    await releaseTurn({ req, claim, state: 'idle' });

    throw error;
  }
}

async function createChat({
  req,
  agentSlug,
}: {
  req: FrogBotRequest;
  agentSlug: string;
}): Promise<DocID> {
  const chat = await req.frogbot.create({
    collection: messagesConfig(req).chatsSlug,
    data: {
      user: req.user?.id ?? null,
      agent: agentSlug,
    },
    req,
    overrideAccess: true,
  });

  return chat.id;
}

async function persistIncoming({
  req,
  chatId,
  messages,
  delivery,
}: {
  req: FrogBotRequest;
  chatId: DocID;
  messages: UIMessage[];
  delivery?: MessageDelivery;
}): Promise<void> {
  const { messagesSlug } = messagesConfig(req);
  const overrideAccess = true;
  const author = actorFromRequest(req);

  const transactionReq = req as unknown as TransactionReq;
  const ownsTransaction = await initTransaction(transactionReq);

  try {
    for (const message of messages) {
      const existing = (
        (await req.frogbot.find({
          collection: messagesSlug,
          where: { and: [{ id: { equals: message.id } }, { chat: { equals: chatId } }] },
          limit: 1,
          pagination: false,
          depth: 0,
          req,
          overrideAccess,
        })) as unknown as {
          docs: Array<{ id: DocID; role: string; status?: string | null; createdAt: string }>;
        }
      ).docs[0];

      if (existing && delivery) {
        throw new TurnError(
          'turn-in-progress',
          `Message '${message.id}' cannot be edited while this chat has a turn in progress.`,
        );
      }

      if (existing && (existing.role !== 'user' || existing.status === 'queued')) {
        throw Object.assign(new Error(`Message '${message.id}' cannot be edited.`), {
          status: 400,
        });
      }

      if (existing) {
        await req.frogbot.update({
          collection: messagesSlug,
          id: existing.id,
          data: { parts: message.parts, metadata: message.metadata },
          req,
          overrideAccess,
        });

        await req.frogbot.delete({
          collection: messagesSlug,
          where: {
            and: [
              { chat: { equals: chatId } },
              { createdAt: { greater_than: existing.createdAt } },
              { status: { not_equals: 'queued' } },
            ],
          },
          req,
          overrideAccess,
        });

        continue;
      }

      await req.frogbot.create({
        collection: messagesSlug,
        data: {
          id: message.id,
          chat: chatId,
          role: message.role,
          parts: message.parts,
          metadata: message.metadata,
          author,
          ...(delivery ? { status: 'queued', delivery } : {}),
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
}

async function resumeChat({
  req,
  agentSlug,
  chat,
  message,
  tools,
}: {
  req: FrogBotRequest;
  agentSlug: string;
  chat: ChatDocument;
  message: UIMessage;
  tools: unknown;
}): Promise<ChatContext> {
  const turnMessage = await findTurnMessage({ req, chatId: chat.id });

  if (!turnMessage || turnMessage.id !== message.id) {
    throw new TurnError('not-awaiting', 'This message is not awaiting input.');
  }

  const outputs = message.parts.filter(
    (part) => isToolPart(part) && part.state === 'output-available',
  );

  if (outputs.length === 0) {
    throw Object.assign(new Error('Submit a tool output for a pending call.'), { status: 400 });
  }

  const pending = new Set(
    getPendingCalls({ message: turnMessage, chatId: chat.id, agentSlug }).map(
      ({ toolCallId }) => toolCallId,
    ),
  );

  const answers = outputs.filter((part) => isToolPart(part) && pending.has(part.toolCallId));

  if (answers.length === 0) {
    throw new TurnError('already-settled', 'This call has already been answered.');
  }

  let allSettled = false;

  for (const part of answers) {
    if (!isToolPart(part) || part.state !== 'output-available') continue;

    const settlement = await settleCall({
      req,
      agentSlug,
      chatId: chat.id,
      toolCallId: part.toolCallId,
      outcome: { output: part.output },
      actor: actorFromRequest(req),
    });

    if (settlement.status === 'already-settled') {
      throw new TurnError('already-settled', 'This call has already been answered.');
    }

    allSettled = settlement.allSettled;
  }

  if (!allSettled) {
    throw new TurnError('pending-calls', 'Other calls in this step are still waiting for input.');
  }

  const claim = await claimTurn({ req, chatId: chat.id, from: 'awaiting' });

  if (!claim) throw new TurnError('turn-in-progress', 'This turn is already continuing.');

  try {
    const uiMessages = await loadChatHistory({ req, chatId: chat.id, tools });

    return { status: 'ready', chatId: chat.id, uiMessages, claim };
  } catch (error) {
    await releaseTurn({ req, claim, state: 'awaiting' });

    throw error;
  }
}
