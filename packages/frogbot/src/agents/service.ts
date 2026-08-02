import type { createAgentUIStreamResponse, UIMessage } from 'ai';
import { consumeStream, convertToModelMessages, generateId } from 'ai';

import { resolveModel } from '../ai/resolve.js';
import { generateMessage } from '../chat/generateMessage.js';
import { createMessageUsage, persistAssistantMessage } from '../chat/messagePersistence.js';
import { resolveThreadContext } from '../chat/threadContext.js';
import type { AgentInstance } from '../types/agent.js';
import type { ManifestResponse } from '../types/chat.js';
import type { DocID } from '../types/operations.js';
import type { FrogbotRequest } from '../types/request.js';

export class AgentServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function getAgent({ req, slug }: { req: FrogbotRequest; slug?: string }): AgentInstance {
  const agent = slug ? req.frogbot.agents[slug] : undefined;
  if (!agent) throw new AgentServiceError(`Agent '${slug ?? ''}' not found`, 404);
  return agent;
}

export async function assertAgentAccess({ req, agent }: { req: FrogbotRequest; agent: AgentInstance }): Promise<void> {
  const access = agent.config.access ?? (({ req: current }: { req: FrogbotRequest }) => !!current.user);
  try {
    if (await access({ req })) return;
  } catch {
    throw new AgentServiceError(`Access denied for agent '${agent.slug}'`, 403);
  }
  throw new AgentServiceError(`Access denied for agent '${agent.slug}'`, 403);
}

export async function listAgents({ req }: { req: FrogbotRequest }): Promise<ManifestResponse['agents']> {
  const agents: ManifestResponse['agents'] = [];
  for (const agent of Object.values(req.frogbot.agents)) {
    try {
      await assertAgentAccess({ req, agent });
      agents.push({
        slug: agent.slug,
        ...(agent.config.profile ? { profile: agent.config.profile } : {}),
      });
    } catch {
      continue;
    }
  }
  return agents;
}

export async function getAgentAuthorizations({ req, agent }: { req: FrogbotRequest; agent: AgentInstance }) {
  return req.frogbot.connections?.authorizations({
    owner: req.user!,
    services: [...new Set((agent.config.tools ?? []).flatMap((tool) => tool.pieceService ? [tool.pieceService] : []))],
  }) ?? [];
}

export async function prepareAgentRequest({
  req,
  agent,
  requestedThreadId,
  uiMessages,
}: {
  req: FrogbotRequest;
  agent: AgentInstance;
  requestedThreadId?: DocID;
  uiMessages: UIMessage[];
}) {
  return resolveThreadContext({
    req,
    agentSlug: agent.slug,
    threadId: requestedThreadId,
    incoming: uiMessages,
    tools: agent.aiAgent.tools,
  });
}

export function getAgentStreamOptions({
  req,
  agent,
  threadId,
  uiMessages,
}: {
  req: FrogbotRequest;
  agent: AgentInstance;
  threadId?: DocID;
  uiMessages: UIMessage[];
}): Parameters<typeof createAgentUIStreamResponse>[0] {
  const model = resolveModel(agent.config.model, req.frogbot.config.ai!);
  return {
    agent: agent.aiAgent,
    uiMessages,
    originalMessages: uiMessages as never,
    generateMessageId: generateId,
    consumeSseStream: consumeStream,
    sendSources: true,
    messageMetadata: ({ part }) =>
      part.type === 'finish' ? { usage: createMessageUsage(part.totalUsage, model) } : undefined,
    onFinish:
      threadId === undefined
        ? undefined
        : ({ responseMessage, isContinuation }) =>
            persistAssistantMessage({ req, threadId, message: responseMessage, isContinuation }),
    options: { req, overrideAccess: true },
    abortSignal: req.signal ?? undefined,
    headers: threadId !== undefined ? { 'X-Frogbot-Thread-Id': String(threadId) } : undefined,
  };
}

export async function generateAgentRequest({
  req,
  agent,
  threadId,
  uiMessages,
}: {
  req: FrogbotRequest;
  agent: AgentInstance;
  threadId?: DocID;
  uiMessages: UIMessage[];
}) {
  const result = await agent.aiAgent.generate({
    messages: await convertToModelMessages(uiMessages, { tools: agent.aiAgent.tools }),
    options: { req, overrideAccess: true, threadId },
    abortSignal: req.signal ?? undefined,
  });
  if (threadId !== undefined) {
    const message = await generateMessage({
      result,
      originalMessages: uiMessages,
      tools: agent.aiAgent.tools,
      model: resolveModel(agent.config.model, req.frogbot.config.ai!),
    });
    await persistAssistantMessage({ req, threadId, message, isContinuation: false });
  }
  return result;
}
