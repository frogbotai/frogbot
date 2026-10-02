import type { UIMessage } from 'ai';
import { createUIMessageStream, createUIMessageStreamResponse, generateId } from 'ai';
import { z } from 'zod';

import type { ChatContext } from '../chat/chatContext.js';
import { resolveChatContext } from '../chat/chatContext.js';
import { buildTurnEndpoints } from '../chat/turn/endpoints.js';
import { allClientTools, streamTurn } from '../chat/turn/streamTurn.js';
import { validateChatMessages } from '../chat/validateMessages.js';
import type { FrogBotRequest } from '../types/request.js';
import { agentResult, errorResponse } from './responses.js';
import {
  assertAgentAccess,
  assertAgentSelection,
  getAgent,
  getAgentAuthorizations,
  getAgentManifest,
} from './service.js';
import type { AgentModelId, AgentSelection } from './types.js';

const bodySchema = z
  .object({
    prompt: z.string().min(1).optional(),
    messages: z.array(z.unknown()).min(1).optional(),
    chatId: z.union([z.string(), z.number()]).optional(),
    model: z.string().min(1).optional(),
    reasoning: z.string().min(1).optional(),
    delivery: z.enum(['queue', 'steer']).optional(),
  })
  .strict()
  .refine((body) => (body.prompt === undefined) !== (body.messages === undefined), {
    message: 'Body must include either `prompt` (string) or `messages` (array)',
  });

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

          const parsed = bodySchema.safeParse(await req.json!().catch(() => undefined));

          if (!parsed.success) {
            return Response.json(
              { error: describeIssue(parsed.error.issues[0]!) },
              { status: 400 },
            );
          }

          const { chatId, model, reasoning, delivery, prompt, messages } = parsed.data;

          let body: AgentRequestBody;

          try {
            body = messages
              ? { messages: await validateChatMessages(messages, agent.aiAgent.tools as never) }
              : { prompt: prompt! };
          } catch (error) {
            req.frogbot.logger.error(
              { err: error, agent: slug },
              '[frogbot] Invalid agent request messages',
            );

            return Response.json(
              { error: '`messages` must be valid UI messages' },
              { status: 400 },
            );
          }

          const selection: AgentSelection = {
            ...(model ? { model: model as AgentModelId } : {}),
            ...(reasoning ? { reasoning } : {}),
          };

          assertAgentSelection({
            agent,
            config: req.frogbot.config.ai!,
            selection,
            user: req.user,
          });

          const eventStream = acceptsEventStream(req.headers.get('accept'));

          const context = await resolveChatContext({
            req,
            agentSlug: agent.slug,
            chatId,
            incoming: toUIMessages(body),
            selection,
            tools: agent.aiAgent.tools,
            delivery,
          });

          if (context.status === 'queued') return queuedResponse({ context, eventStream });

          const turn = await streamTurn({
            req,
            agent,
            claim: context.claim,
            uiMessages: context.uiMessages,
            strictAttachments: true,
            selection: context.selection,
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

function describeIssue(issue: z.ZodError['issues'][number]): string {
  const path = issue.path.join('.');

  return path ? `\`${path}\`: ${issue.message}` : issue.message;
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
