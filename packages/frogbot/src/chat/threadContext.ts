import type { UIMessage } from 'ai';
import { commitTransaction, initTransaction, killTransaction, NotFound } from 'payload';

import type { DocID } from '../types/operations.js';
import type { FrogbotRequest } from '../types/request.js';
import { validateChatMessages } from './validateMessages.js';

export type ThreadContext = {
  threadId?: DocID;
  uiMessages: UIMessage[];
};

export type ResolveThreadContextProps = {
  req: FrogbotRequest;
  agentSlug: string;
  threadId?: DocID;
  incoming: UIMessage[];
  tools: unknown;
};

type TransactionReq = Parameters<typeof initTransaction>[0];

export async function resolveThreadContext({
  req,
  agentSlug,
  threadId,
  incoming,
  tools,
}: ResolveThreadContextProps): Promise<ThreadContext> {
  const chat = req.frogbot.config.chat;
  if (!chat.enabled) return { uiMessages: incoming };

  const overrideAccess = true;

  const newMessages = threadId !== undefined ? incoming.slice(-1) : incoming;
  if (newMessages.length === 0) {
    throw Object.assign(new Error('At least one user message is required'), { status: 400 });
  }
  if (newMessages.some((message) => message.role !== 'user')) {
    throw Object.assign(new Error('Only user messages can be submitted'), { status: 400 });
  }
  const transactionReq = req as unknown as TransactionReq;
  const ownsTransaction = await initTransaction(transactionReq);

  let resolvedThreadId: DocID;
  try {
    resolvedThreadId = await resolveThreadId({ req, agentSlug, threadId, threadsSlug: chat.threadsSlug });

    for (const message of newMessages) {
      await req.frogbot.create({
        collection: chat.messagesSlug,
        data: {
          id: message.id,
          thread: resolvedThreadId,
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
    where: { thread: { equals: resolvedThreadId } },
    sort: ['createdAt', 'id'],
    pagination: false,
    depth: 0,
    req,
    overrideAccess,
  });

  const uiMessages = await validateChatMessages(history.docs.map(toUIMessage), tools as never);

  return { threadId: resolvedThreadId, uiMessages };
}

type ResolveThreadIdProps = {
  req: FrogbotRequest;
  agentSlug: string;
  threadId?: DocID;
  threadsSlug: string;
};

async function resolveThreadId({ req, agentSlug, threadId, threadsSlug }: ResolveThreadIdProps): Promise<DocID> {
  const overrideAccess = true;
  if (threadId !== undefined) {
    const thread = (await req.frogbot.findByID({
      collection: threadsSlug,
      id: threadId,
      depth: 0,
      req,
      overrideAccess,
    })) as { user?: { id: DocID } | DocID | null };
    const ownerId = typeof thread.user === 'object' && thread.user !== null ? thread.user.id : thread.user;
    if ((ownerId ?? null) !== (req.user?.id ?? null)) throw new NotFound(req.t);
    return threadId;
  }

  const thread = await req.frogbot.create({
    collection: threadsSlug,
    data: {
      user: req.user?.id ?? null,
      agent: agentSlug,
    },
    req,
    overrideAccess,
  });
  return thread.id;
}

function toUIMessage(doc: unknown): UIMessage {
  const message = doc as { id: DocID; role: UIMessage['role']; parts: UIMessage['parts']; metadata?: unknown };
  return {
    id: String(message.id),
    role: message.role,
    parts: message.parts,
    ...(message.metadata == null ? {} : { metadata: message.metadata }),
  };
}
