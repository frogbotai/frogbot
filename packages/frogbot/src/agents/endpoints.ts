import type { UIMessage } from 'ai';
import { createAgentUIStreamResponse, generateId, validateUIMessages } from 'ai';
import { z } from 'zod';

import type { DocID } from '../types/operations.js';
import type { FrogbotRequest } from '../types/request.js';
import {
  AgentServiceError,
  assertAgentAccess,
  generateAgentRequest,
  getAgent,
  getAgentAuthorizations,
  getAgentStreamOptions,
  listAgents,
  prepareAgentRequest,
} from './service.js';

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
        try {
          const agent = getAgent({ req, slug });
          await assertAgentAccess({ req, agent });

          let body: AgentRequestBody;
          let requestedThreadId: DocID | undefined;
          try {
            const { threadId, ...parsed } = bodySchema.parse(await req.json!());
            requestedThreadId = threadId;
            body =
              'messages' in parsed && parsed.messages
                ? { messages: await validateUIMessages({ messages: parsed.messages, tools: agent.aiAgent.tools as never }) }
                : parsed;
          } catch {
            return Response.json({ error: 'Body must include `prompt` (string) or `messages` (array)' }, { status: 400 });
          }

          const { threadId, uiMessages } = await prepareAgentRequest({
            req,
            agent,
            requestedThreadId,
            uiMessages: toUIMessages(body),
          });

          if (acceptsEventStream(req.headers.get('accept'))) {
            return await createAgentUIStreamResponse(getAgentStreamOptions({ req, agent, threadId, uiMessages }));
          }

          const result = await generateAgentRequest({ req, agent, threadId, uiMessages });

          return Response.json({
            text: result.text,
            usage: result.totalUsage,
            finishReason: result.finishReason,
            authorizations: req.user ? await getAgentAuthorizations({ req, agent }) : [],
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
      path: '/agents/:slug/authorizations',
      method: 'get' as const,
      handler: async (req: FrogbotRequest) => {
        if (!req.user) return Response.json({ error: 'Authentication required' }, { status: 401 });
        const slug = req.routeParams?.slug as string | undefined;
        let agent: ReturnType<typeof getAgent>;
        try {
          agent = getAgent({ req, slug });
          await assertAgentAccess({ req, agent });
        } catch (error) {
          return Response.json({ error: getErrorMessage(error) }, { status: getErrorStatus(error) });
        }
        return Response.json({ authorizations: await getAgentAuthorizations({ req, agent }) });
      },
    },
    {
      path: '/agents',
      method: 'get' as const,
      handler: async (req: FrogbotRequest) => {
        return Response.json({ agents: await listAgents({ req }) });
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
  if (error instanceof AgentServiceError) return error.status;
  if (typeof error !== 'object' || error === null) return 500;
  const status = 'status' in error ? error.status : 'statusCode' in error ? error.statusCode : undefined;
  return typeof status === 'number' && status >= 400 && status <= 599 ? status : 500;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Agent request failed';
}
