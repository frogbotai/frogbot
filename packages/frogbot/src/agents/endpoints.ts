import type { UIMessage } from 'ai';
import { createUIMessageStream, createUIMessageStreamResponse, generateId } from 'ai';
import { z } from 'zod';

import { aiError } from '../ai/aiError.js';
import type { ChatContext } from '../chat/chatContext.js';
import { resolveChatContext } from '../chat/chatContext.js';
import { buildTurnEndpoints } from '../chat/turn/endpoints.js';
import { allClientTools, streamTurn } from '../chat/turn/streamTurn.js';
import {
  describeMessagesError,
  formatIssuePath,
  validateChatMessages,
} from '../chat/validateMessages.js';
import { frogbotError } from '../errors/catalog.js';
import type { FrogBotRequest } from '../types/request.js';
import { agentResult } from './responses.js';
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
    autoApprove: z.boolean().optional(),
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
        let model: string | undefined;
        try {
          const agent = getAgent({ req, slug });
          await assertAgentAccess({ req, agent });

          const parsed = bodySchema.safeParse(await req.json!().catch(() => undefined));

          if (!parsed.success) throw invalidBody(parsed.error.issues);

          const { chatId, reasoning, delivery, prompt, messages, autoApprove } = parsed.data;
          const requested = parsed.data.model;

          let body: AgentRequestBody;

          try {
            body = messages
              ? { messages: await validateChatMessages(messages, agent.aiAgent.tools) }
              : { prompt: prompt! };
          } catch (error) {
            throw frogbotError('request.invalid', {
              detail:
                describeMessagesError(error, messages ?? []) ??
                '`messages` must be valid UI messages.',
              fields: [{ path: 'messages', message: 'must be valid UI messages' }],
              cause: error,
            });
          }

          const selection: AgentSelection = {
            ...(requested ? { model: requested as AgentModelId } : {}),
            ...(reasoning ? { reasoning } : {}),
          };

          ({ model } = await assertAgentSelection({
            agent,
            config: req.frogbot.config.ai!,
            selection,
            req,
          }));

          const eventStream = acceptsEventStream(req.headers.get('accept'));

          const context = await resolveChatContext({
            req,
            agentSlug: agent.slug,
            chatId,
            incoming: toUIMessages(body),
            selection,
            tools: agent.aiAgent.tools,
            delivery,
            autoApprove,
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

          throw aiError({ error, model, config: req.frogbot.config.ai }) ?? error;
        }
      },
    },
    ...buildTurnEndpoints(),
    {
      path: '/agents/:slug/authorizations',
      method: 'get' as const,
      handler: async (req: FrogBotRequest) => {
        if (!req.user) throw frogbotError('auth.unauthenticated');

        const agent = getAgent({ req, slug: req.routeParams?.slug as string | undefined });
        await assertAgentAccess({ req, agent });

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

function invalidBody(issues: z.ZodError['issues']) {
  const fields = issues.map((issue) => ({
    path: formatIssuePath(issue.path),
    message: issue.message,
  }));

  const [first] = fields;

  return frogbotError('request.invalid', {
    detail: first.path ? `\`${first.path}\`: ${first.message}` : first.message,
    fields: fields.filter((field) => field.path),
  });
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
