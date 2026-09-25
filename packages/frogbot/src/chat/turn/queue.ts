import type { UIMessage } from 'ai';

import { AgentServiceError, assertAgentAccess } from '../../agents/service.js';
import type { AgentInstance } from '../../agents/types.js';
import type { DocID } from '../../collections/config/types.js';
import { updateIfVersion } from '../../database/compareAndSet.js';
import type { FrogBot } from '../../frogbot.js';
import type { FrogBotRequest } from '../../types/request.js';
import type { ChatDocument } from '../findChat.js';
import { messagesToUIMessages } from '../messagesToUIMessages.js';
import type { TurnMessageDocument } from './messages.js';
import { loadChatHistory, messagesConfig } from './messages.js';
import { claimTurn, releaseTurn } from './state.js';
import { allClientTools, streamTurn } from './streamTurn.js';
import type { MessageDelivery, TurnActor, TurnClaim } from './types.js';

export type QueuedChatDocument = ChatDocument & {
  channelThread?: { account: string; thread: { id: string } } | null;
};

export type TurnRunnerArgs = {
  req: FrogBotRequest;
  agent: AgentInstance;
  chat: QueuedChatDocument;
  claim: TurnClaim;
  uiMessages: UIMessage[];
};

export type TurnRunner = (args: TurnRunnerArgs) => Promise<boolean>;

const runners = new WeakMap<FrogBot, TurnRunner>();

export function registerTurnRunner(frogbot: FrogBot, runner: TurnRunner): () => void {
  runners.set(frogbot, runner);

  return () => {
    if (runners.get(frogbot) === runner) runners.delete(frogbot);
  };
}

export function promoteQueuedMessage({
  req,
  chatId,
}: {
  req: FrogBotRequest;
  chatId: DocID;
}): void {
  void runQueuedTurn({ frogbot: req.frogbot, chatId }).catch((error: unknown) => {
    req.frogbot.logger.error({ err: error, chatId }, '[frogbot] Failed to run a queued message.');
  });
}

export async function runQueuedTurn({
  frogbot,
  chatId,
}: {
  frogbot: FrogBot;
  chatId: DocID;
}): Promise<void> {
  const baseReq = await frogbot.createRequest({});
  const message = await findQueuedMessages({ req: baseReq, chatId }).then((docs) => docs[0]);

  if (!message) return;

  const claim = await claimTurn({ req: baseReq, chatId, from: 'idle' });

  if (!claim) return;

  let started = false;
  let promoteNext = false;

  try {
    const chat = (await frogbot.findByID({
      collection: messagesConfig(baseReq).chatsSlug,
      id: chatId,
      depth: 0,
      disableErrors: true,
      req: baseReq,
      overrideAccess: true,
    })) as QueuedChatDocument | null;

    const agent = chat?.agent ? frogbot.agents[chat.agent] : undefined;

    if (!chat || !agent) return;

    const req = await requestForActor({ frogbot, chat, actor: message.author });

    if (!(await hasAgentAccess({ req, agent }))) {
      promoteNext = await discardQueuedMessage({ req: baseReq, message });

      return;
    }

    const activated = await updateIfVersion({
      req: baseReq,
      collection: messagesConfig(baseReq).messagesSlug,
      id: message.id,
      version: message.version ?? 0,
      data: { status: 'active', delivery: null, createdAt: new Date().toISOString() },
    });

    if (!activated) {
      promoteNext = true;

      return;
    }

    const uiMessages = await loadChatHistory({ req, chatId, tools: agent.aiAgent.tools });
    const runner = chat.channelKey ? runners.get(frogbot) : undefined;

    started = true;

    if (runner && (await runner({ req, agent, chat, claim, uiMessages }))) return;

    const turn = await streamTurn({
      req,
      agent,
      claim,
      uiMessages,
      clientTools: chat.channelKey ? { kinds: [] } : allClientTools(agent),
    });

    await turn.persistence;
  } finally {
    if (!started) {
      const released = await releaseTurn({ req: baseReq, claim, state: 'idle' });

      if (released && promoteNext) promoteQueuedMessage({ req: baseReq, chatId });
    }
  }
}

export async function promoteSteerMessages({
  req,
  chatId,
  before,
  actor,
}: {
  req: FrogBotRequest;
  chatId: DocID;
  before?: string;
  actor: TurnActor;
}): Promise<UIMessage[]> {
  const messages = (await findQueuedMessages({ req, chatId, delivery: 'steer' })).filter(
    (message) => isSameActor(message.author, actor),
  );

  if (messages.length === 0) return [];

  const createdAt = before
    ? new Date(new Date(before).getTime() - 1).toISOString()
    : new Date().toISOString();
  const promoted: TurnMessageDocument[] = [];

  for (const message of messages) {
    const activated = await updateIfVersion({
      req,
      collection: messagesConfig(req).messagesSlug,
      id: message.id,
      version: message.version ?? 0,
      data: { status: 'active', delivery: null, createdAt },
    });

    if (activated) promoted.push(message);
  }

  return messagesToUIMessages(promoted as never);
}

export async function updateQueuedMessage({
  req,
  message,
  parts,
  delivery,
}: {
  req: FrogBotRequest;
  message: TurnMessageDocument;
  parts?: UIMessage['parts'];
  delivery?: MessageDelivery;
}): Promise<boolean> {
  return updateIfVersion({
    req,
    collection: messagesConfig(req).messagesSlug,
    id: message.id,
    version: message.version ?? 0,
    data: {
      ...(parts ? { parts } : {}),
      ...(delivery ? { delivery } : {}),
    },
  });
}

export async function discardQueuedMessage({
  req,
  message,
}: {
  req: FrogBotRequest;
  message: TurnMessageDocument;
}): Promise<boolean> {
  return updateIfVersion({
    req,
    collection: messagesConfig(req).messagesSlug,
    id: message.id,
    version: message.version ?? 0,
    data: { deletedAt: new Date().toISOString() },
  });
}

export function isSameActor(a: TurnActor | null | undefined, b: TurnActor): boolean {
  return (
    (a?.user?.collection ?? '') === (b.user?.collection ?? '') &&
    String(a?.user?.id ?? '') === String(b.user?.id ?? '') &&
    (a?.channel?.id ?? '') === (b.channel?.id ?? '')
  );
}

async function findQueuedMessages({
  req,
  chatId,
  delivery,
}: {
  req: FrogBotRequest;
  chatId: DocID;
  delivery?: MessageDelivery;
}): Promise<TurnMessageDocument[]> {
  const result = await req.frogbot.find({
    collection: messagesConfig(req).messagesSlug,
    where: {
      and: [
        { chat: { equals: chatId } },
        { status: { equals: 'queued' } },
        ...(delivery ? [{ delivery: { equals: delivery } }] : []),
      ],
    },
    sort: ['createdAt', 'id'],
    pagination: false,
    depth: 0,
    req,
    overrideAccess: true,
  });

  return result.docs as unknown as TurnMessageDocument[];
}

async function requestForActor({
  frogbot,
  chat,
  actor,
}: {
  frogbot: FrogBot;
  chat: QueuedChatDocument;
  actor?: TurnActor | null;
}): Promise<FrogBotRequest> {
  const collection =
    actor?.user?.collection || (await frogbot.config._internal.payloadConfig).admin.user;

  const user = actor?.user
    ? await frogbot.findByID({
        collection,
        id: actor.user.id,
        depth: 0,
        disableErrors: true,
        overrideAccess: true,
      })
    : null;

  const channel = actor?.channel;
  const threadId = chat.channelThread?.thread.id;

  return frogbot.createRequest({
    user: user ? ({ ...user, collection } as FrogBotRequest['user']) : null,
    ...(channel && threadId
      ? {
          context: {
            channel: {
              piece: channel.piece,
              threadId,
              author: {
                id: channel.id,
                ...(channel.username ? { username: channel.username } : {}),
                ...(channel.name ? { name: channel.name } : {}),
              },
            },
          },
        }
      : {}),
  });
}

async function hasAgentAccess({
  req,
  agent,
}: {
  req: FrogBotRequest;
  agent: AgentInstance;
}): Promise<boolean> {
  try {
    await assertAgentAccess({ req, agent });

    return true;
  } catch (error) {
    if (error instanceof AgentServiceError && error.status === 403) return false;

    throw error;
  }
}
