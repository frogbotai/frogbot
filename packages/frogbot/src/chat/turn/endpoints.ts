import type { UIMessage } from 'ai';
import { z } from 'zod';

import { agentResult, errorResponse } from '../../agents/responses.js';
import { assertAgentAccess, getAgent } from '../../agents/service.js';
import type { AgentInstance } from '../../agents/types.js';
import type { DocID } from '../../collections/config/types.js';
import type { Endpoint } from '../../endpoints/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import { findChat } from '../findChat.js';
import { validateChatMessages } from '../validateMessages.js';
import { actorFromRequest } from './actor.js';
import { continueTurn } from './continueTurn.js';
import { TurnError } from './errors.js';
import type { TurnMessageDocument } from './messages.js';
import { findMessage } from './messages.js';
import { discardQueuedMessage, isSameActor, updateQueuedMessage } from './queue.js';
import { listPendingCalls, settleClientToolCall } from './settle.js';
import { findTurnState } from './state.js';
import { allClientTools } from './streamTurn.js';

const settleSchema = z.union([
  z.object({ toolCallId: z.string().min(1), output: z.unknown() }).strict(),
  z.object({ toolCallId: z.string().min(1), dismissed: z.literal(true) }).strict(),
]);

const queuedMessageSchema = z
  .object({
    parts: z.array(z.unknown()).min(1).optional(),
    delivery: z.enum(['queue', 'steer']).optional(),
  })
  .strict();

type ChatRoute = {
  agent: AgentInstance;
  chatId: DocID;
};

export function buildTurnEndpoints(): Endpoint[] {
  return [
    {
      path: '/agents/:slug/chats/:chatId/pending',
      method: 'get',
      handler: async (req: FrogBotRequest) => {
        try {
          const { chatId } = await resolveChatRoute(req);

          return Response.json({
            chatId,
            state: await findTurnState({ req, chatId }),
            pending: await listPendingCalls({ req, chatId }),
          });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
    {
      path: '/agents/:slug/chats/:chatId/settle',
      method: 'post',
      handler: async (req: FrogBotRequest) => {
        try {
          const { agent, chatId } = await resolveChatRoute(req);
          const body = settleSchema.safeParse(await req.json?.().catch(() => null));

          if (!body.success) {
            return Response.json(
              { error: 'Body must include `toolCallId` and either `output` or `dismissed: true`' },
              { status: 400 },
            );
          }

          const { toolCallId, ...outcome } = body.data;

          const settlement = await settleClientToolCall({
            req,
            chatId,
            toolCallId,
            outcome: 'dismissed' in outcome ? { dismissed: true } : { output: outcome.output },
          });

          if (settlement.status === 'already-settled') {
            return Response.json(
              { error: 'This call has already been settled.', code: 'already-settled', settlement },
              { status: 409 },
            );
          }

          if ('dismissed' in outcome) {
            return Response.json({ status: 'dismissed', chatId, settlement });
          }

          if (!settlement.allSettled) {
            return Response.json({
              status: 'awaiting-input',
              chatId,
              settlement,
              pending: await listPendingCalls({ req, chatId }),
            });
          }

          const turn = await continueTurn({
            req,
            chatId,
            clientTools: allClientTools(agent),
            abortSignal: req.signal ?? undefined,
          });

          if (!('persistence' in turn)) {
            return Response.json({ status: turn.status, chatId, settlement });
          }

          await turn.persistence;

          return Response.json({
            settlement,
            ...(await agentResult({ req, agent, chatId, turn: { result: turn } })),
          });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
    {
      path: '/agents/:slug/chats/:chatId/messages/:messageId',
      method: 'patch',
      handler: async (req: FrogBotRequest) => {
        try {
          const { agent, chatId } = await resolveChatRoute(req);
          const body = queuedMessageSchema.safeParse(await req.json?.().catch(() => null));

          if (!body.success || (!body.data.parts && !body.data.delivery)) {
            return Response.json(
              { error: 'Body must include `parts` or `delivery`' },
              { status: 400 },
            );
          }

          const message = await findQueuedMessage({ req, chatId });

          const parts = body.data.parts
            ? await validateParts({ agent, message, parts: body.data.parts })
            : undefined;

          if (!(await updateQueuedMessage({ req, message, parts, delivery: body.data.delivery }))) {
            throw new TurnError('not-queued', 'This message is no longer queued.');
          }

          return Response.json({ message: await findMessage({ req, id: message.id }) });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
    {
      path: '/agents/:slug/chats/:chatId/messages/:messageId',
      method: 'delete',
      handler: async (req: FrogBotRequest) => {
        try {
          const { chatId } = await resolveChatRoute(req);
          const message = await findQueuedMessage({ req, chatId });

          if (!(await discardQueuedMessage({ req, message }))) {
            throw new TurnError('not-queued', 'This message is no longer queued.');
          }

          return new Response(null, { status: 204 });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  ];
}

async function resolveChatRoute(req: FrogBotRequest): Promise<ChatRoute> {
  const agent = getAgent({ req, slug: req.routeParams?.slug as string | undefined });

  await assertAgentAccess({ req, agent });

  const chat = await findChat({
    req,
    agentSlug: agent.slug,
    chatId: req.routeParams?.chatId as DocID,
  });

  if (chat.agent !== agent.slug) {
    throw new TurnError('not-found', `Chat '${chat.id}' does not belong to this agent.`);
  }

  return { agent, chatId: chat.id };
}

async function findQueuedMessage({
  req,
  chatId,
}: {
  req: FrogBotRequest;
  chatId: DocID;
}): Promise<TurnMessageDocument> {
  const message = await findMessage({ req, id: String(req.routeParams?.messageId ?? '') });
  const chat = typeof message?.chat === 'object' ? message.chat.id : message?.chat;

  if (!message || String(chat) !== String(chatId)) {
    throw new TurnError('not-found', 'Message not found.');
  }

  if (!isSameActor(message.author, actorFromRequest(req))) {
    throw new TurnError('forbidden', 'Only the author can change a queued message.');
  }

  if (message.status !== 'queued') {
    throw new TurnError('not-queued', 'This message is no longer queued.');
  }

  return message;
}

async function validateParts({
  agent,
  message,
  parts,
}: {
  agent: AgentInstance;
  message: TurnMessageDocument;
  parts: unknown[];
}): Promise<UIMessage['parts']> {
  const [validated] = await validateChatMessages(
    [{ id: message.id, role: 'user', parts }],
    agent.aiAgent.tools as never,
  );

  return validated!.parts;
}
