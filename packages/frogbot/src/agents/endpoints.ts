import { createAgentUIStreamResponse, generateId, validateUIMessages } from 'ai';
import type { UIMessage } from 'ai';
import { z } from 'zod';

import { resolveThreadContext } from '../chat/threadContext.js';
import type { InternalAgentInstance } from '../types/agent.js';
import type { DocID } from '../types/operations.js';
import type { FrogbotRequest } from '../types/request.js';

const threadIdSchema = z.union([z.string(), z.number()]).optional();

const bodySchema = z.union([
  z.object({ prompt: z.string().min(1), messages: z.never().optional(), threadId: threadIdSchema }).strict(),
  z
    .object({
      messages: z.array(z.unknown()).min(1),
      prompt: z.never().optional(),
      threadId: threadIdSchema,
    })
    .strict(),
]);

type AgentRequestBody = { prompt: string; messages?: never } | { messages: UIMessage[]; prompt?: never };

export function buildAgentEndpoints() {
  return [
    {
      path: '/agents/:slug',
      method: 'post' as const,
      handler: async (req: FrogbotRequest) => {
        const slug = req.routeParams?.slug as string | undefined;
        const agent = slug ? (req.frogbot.agents[slug] as InternalAgentInstance | undefined) : undefined;

        if (!agent) return Response.json({ error: `Agent '${slug ?? ''}' not found` }, { status: 404 });

        let body: AgentRequestBody;
        let requestedThreadId: DocID | undefined;
        try {
          const { threadId, ...parsed } = bodySchema.parse(await req.json!());
          requestedThreadId = threadId;
          body =
            'messages' in parsed && parsed.messages
              ? {
                  messages: await validateUIMessages({
                    messages: parsed.messages,
                    tools: agent.aiAgent.tools as never,
                  }),
                }
              : parsed;
        } catch {
          return Response.json(
            {
              error: 'Body must include `prompt` (string) or `messages` (array)',
            },
            { status: 400 },
          );
        }

        if (requestedThreadId !== undefined && !req.user) {
          return Response.json({ error: 'Authentication required to use threads' }, { status: 401 });
        }

        try {
          const { threadId, uiMessages } = await resolveThreadContext({
            req,
            agentSlug: agent.slug,
            threadId: requestedThreadId,
            incoming: toUIMessages(body),
            tools: agent.aiAgent.tools,
          });

          if (acceptsEventStream(req.headers.get('accept'))) {
            return await createAgentUIStreamResponse({
              agent: agent.aiAgent,
              uiMessages,
              options: { req, overrideAccess: false },
              abortSignal: req.signal ?? undefined,
              headers: threadId !== undefined ? { 'X-Frogbot-Thread-Id': String(threadId) } : undefined,
            });
          }

          const result = await agent.generate({
            messages: uiMessages,
            req,
            overrideAccess: false,
            abortSignal: req.signal ?? undefined,
          });

          return Response.json({
            text: result.text,
            usage: result.totalUsage,
            finishReason: result.finishReason,
            ...(threadId !== undefined ? { threadId } : {}),
          });
        } catch (error) {
          if (req.signal?.aborted) return new Response(null, { status: 499 });
          return Response.json(
            {
              error: error instanceof Error ? error.message : 'Agent request failed',
            },
            { status: getErrorStatus(error) },
          );
        }
      },
    },
    {
      path: '/agents',
      method: 'get' as const,
      handler: async (req: FrogbotRequest) => {
        const agents: { slug: string }[] = [];

        for (const instance of Object.values(req.frogbot.agents)) {
          const access = instance.config.access ?? (({ req: current }) => !!current.user);
          try {
            if (await access({ req })) agents.push({ slug: instance.slug });
          } catch {
            continue;
          }
        }

        return Response.json({ agents });
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

function acceptsEventStream(accept: string | null): boolean {
  return accept?.split(',').some((value) => value.trim().split(';', 1)[0] === 'text/event-stream') ?? false;
}

function getErrorStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null) return 500;
  const status = 'status' in error ? error.status : 'statusCode' in error ? error.statusCode : undefined;
  return typeof status === 'number' && status >= 400 && status <= 599 ? status : 500;
}
