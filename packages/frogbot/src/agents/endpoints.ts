import type { UIMessage } from 'ai';
import { createUIMessageStream, createUIMessageStreamResponse, generateId } from 'ai';
import { z } from 'zod';

import type { ChatContext } from '../chat/chatContext.js';
import { resolveChatContext } from '../chat/chatContext.js';
import { buildTurnEndpoints } from '../chat/turn/endpoints.js';
import { releaseTurn } from '../chat/turn/state.js';
import { allClientTools, streamTurn } from '../chat/turn/streamTurn.js';
import { validateChatMessages } from '../chat/validateMessages.js';
import type { DocID } from '../collections/config/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { resolveChatAttachments } from '../uploads/resolveChatAttachments.js';
import { agentResult, errorResponse } from './responses.js';
import {
  assertAgentAccess,
  assertAllowedModel,
  getAgent,
  getAgentAuthorizations,
  getAgentManifest,
} from './service.js';

const chatIdSchema = z.union([z.string(), z.number()]).optional();
const deliverySchema = z.enum(['queue', 'steer']).optional();

const bodySchema = z.union([
  z
    .object({
      prompt: z.string().min(1),
      messages: z.never().optional(),
      chatId: chatIdSchema,
      model: z.string().min(1).optional(),
      delivery: deliverySchema,
    })
    .strict(),
  z
    .object({
      messages: z.array(z.unknown()).min(1),
      prompt: z.never().optional(),
      chatId: chatIdSchema,
      model: z.string().min(1).optional(),
      delivery: deliverySchema,
    })
    .strict(),
]);

type AgentRequestBody =
  { prompt: string; messages?: never } | { messages: UIMessage[]; prompt?: never };

export function buildAgentEndpoints() {
  return [
    {
      path: '/agents/:slug',
      method: 'post' as const,
      handler: async (req: FrogBotRequest) => {
        const slug = req.routeParams?.slug as string | undefined;
        try {
          const agent = getAgent({ req, slug });
          await assertAgentAccess({ req, agent });

          let body: AgentRequestBody;
          let requestedChatId: DocID | undefined;
          let requestedModel: string | undefined;
          let delivery: 'queue' | 'steer' | undefined;

          try {
            const {
              chatId,
              model,
              delivery: requestedDelivery,
              ...parsed
            } = bodySchema.parse(await req.json!());

            requestedChatId = chatId;
            requestedModel = model;
            delivery = requestedDelivery;
            body =
              'messages' in parsed && parsed.messages
                ? {
                    messages: await validateChatMessages(
                      parsed.messages,
                      agent.aiAgent.tools as never,
                    ),
                  }
                : parsed;
          } catch (error) {
            req.frogbot.logger.error(
              { err: error, agent: slug },
              '[frogbot] Invalid agent request body',
            );
            return Response.json(
              { error: 'Body must include `prompt` (string) or `messages` (array)' },
              { status: 400 },
            );
          }

          const model = assertAllowedModel({ agent, model: requestedModel });
          const eventStream = acceptsEventStream(req.headers.get('accept'));

          const context = await resolveChatContext({
            req,
            agentSlug: agent.slug,
            chatId: requestedChatId,
            incoming: toUIMessages(body),
            tools: agent.aiAgent.tools,
            delivery,
          });

          if (context.status === 'queued') return queuedResponse({ context, eventStream });

          const providerMessages = await resolveChatAttachments({
            req,
            messages: context.uiMessages,
            chatId: context.chatId,
          }).catch(async (error: unknown) => {
            await releaseTurn({ req, claim: context.claim, state: 'idle' });

            throw error;
          });

          const turn = await streamTurn({
            req,
            agent,
            claim: context.claim,
            uiMessages: context.uiMessages,
            providerMessages,
            model,
            clientTools: allClientTools(agent),
            abortSignal: req.signal ?? undefined,
            ...(eventStream
              ? {}
              : {
                  onError: (error: unknown) => {
                    throw error;
                  },
                }),
          });

          if (eventStream) {
            return createUIMessageStreamResponse({
              stream: turn.uiMessageStream,
              headers: { 'X-FrogBot-Chat-Id': String(context.chatId) },
            });
          }

          await turn.persistence;

          return Response.json(await agentResult({ req, agent, chatId: context.chatId, turn }));
        } catch (error) {
          if (req.signal?.aborted) return new Response(null, { status: 499 });
          req.frogbot.logger.error({ err: error, agent: slug }, '[frogbot] Agent request failed');
          return errorResponse(error);
        }
      },
    },
    ...buildTurnEndpoints(),
    {
      path: '/agents/:slug/authorizations',
      method: 'get' as const,
      handler: async (req: FrogBotRequest) => {
        if (!req.user) return Response.json({ error: 'Authentication required' }, { status: 401 });
        const slug = req.routeParams?.slug as string | undefined;
        let agent: ReturnType<typeof getAgent>;
        try {
          agent = getAgent({ req, slug });
          await assertAgentAccess({ req, agent });
        } catch (error) {
          return errorResponse(error);
        }
        return Response.json({ authorizations: await getAgentAuthorizations({ req, agent }) });
      },
    },
    {
      path: '/agents',
      method: 'get' as const,
      handler: async (req: FrogBotRequest) => {
        return Response.json(await getAgentManifest({ req }));
      },
    },
  ];
}

function toUIMessages(body: AgentRequestBody): UIMessage[] {
  if ('messages' in body && body.messages) return body.messages;

  return [
    {
      id: generateId(),
      role: 'user',
      parts: [{ type: 'text', text: body.prompt }],
    } satisfies UIMessage,
  ];
}

function queuedResponse({
  context,
  eventStream,
}: {
  context: Extract<ChatContext, { status: 'queued' }>;
  eventStream: boolean;
}): Response {
  const headers = { 'X-FrogBot-Chat-Id': String(context.chatId) };
  const data = { messageId: context.messageId, delivery: context.delivery };

  if (!eventStream) {
    return Response.json(
      { status: 'queued', chatId: context.chatId, ...data },
      { status: 202, headers },
    );
  }

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'data-queued', data, transient: true });
      },
    }),
    headers,
  });
}

function acceptsEventStream(accept: string | null): boolean {
  return (
    accept?.split(',').some((value) => value.trim().split(';', 1)[0] === 'text/event-stream') ??
    false
  );
}
