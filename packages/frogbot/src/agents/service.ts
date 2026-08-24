import type { createAgentUIStreamResponse, UIMessage } from 'ai';
import { consumeStream, convertToModelMessages, generateId } from 'ai';

import { resolveModel } from '../ai/resolve.js';
import { resolveChatContext } from '../chat/chatContext.js';
import { generateMessage } from '../chat/generateMessage.js';
import { createMessageUsage, persistAssistantMessage } from '../chat/messagePersistence.js';
import type { AgentInstance, AgentManifest } from '../types/agent.js';
import type { ManifestResponse } from '../types/chat.js';
import type { DocID } from '../types/operations.js';
import type { FrogbotRequest } from '../types/request.js';

export class AgentServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function getAgent({ req, slug }: { req: FrogbotRequest; slug?: string }): AgentInstance {
  const agent = slug ? req.frogbot.agents[slug] : undefined;
  if (!agent) throw new AgentServiceError(`Agent '${slug ?? ''}' not found`, 404);
  return agent;
}

export async function assertAgentAccess({
  req,
  agent,
}: {
  req: FrogbotRequest;
  agent: AgentInstance;
}): Promise<void> {
  const access =
    agent.config.access ?? (({ req: current }: { req: FrogbotRequest }) => !!current.user);
  try {
    if (await access({ req, agent })) return;
  } catch {
    throw new AgentServiceError(`Access denied for agent '${agent.slug}'`, 403);
  }
  throw new AgentServiceError(`Access denied for agent '${agent.slug}'`, 403);
}

export async function listAgents({
  req,
}: {
  req: FrogbotRequest;
}): Promise<ManifestResponse['agents']> {
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

export async function getAgentManifest({ req }: { req: FrogbotRequest }): Promise<AgentManifest> {
  const agents: AgentManifest['agents'] = [];
  for (const agent of Object.values(req.frogbot.agents)) {
    try {
      await assertAgentAccess({ req, agent });
    } catch {
      continue;
    }
    agents.push({
      slug: agent.slug,
      label: agent.config.profile?.name ?? agent.slug,
      source: 'config',
      defaultModel: agent.config.model,
      models: [...new Set([agent.config.model, ...(agent.config.allowModels ?? [])])],
    });
  }
  return { defaultAgent: agents[0]?.slug ?? '', agents };
}

export async function getAgentAuthorizations({
  req,
  agent,
}: {
  req: FrogbotRequest;
  agent: AgentInstance;
}) {
  return (
    req.frogbot.connections?.authorizations({
      owner: req.user!,
      services: [
        ...new Set(
          (agent.config.tools ?? []).flatMap((tool) =>
            tool.pieceService ? [tool.pieceService] : [],
          ),
        ),
      ],
    }) ?? []
  );
}

export async function prepareAgentRequest({
  req,
  agent,
  requestedModel,
  requestedChatId,
  uiMessages,
}: {
  req: FrogbotRequest;
  agent: AgentInstance;
  requestedModel?: string;
  requestedChatId?: DocID;
  uiMessages: UIMessage[];
}) {
  const models = new Set<string>([agent.config.model, ...(agent.config.allowModels ?? [])]);
  if (requestedModel !== undefined && !models.has(requestedModel)) {
    throw new AgentServiceError(
      `Model '${requestedModel}' is not allowed for agent '${agent.slug}'`,
      403,
    );
  }
  return resolveChatContext({
    req,
    agentSlug: agent.slug,
    chatId: requestedChatId,
    incoming: uiMessages,
    tools: agent.aiAgent.tools,
  });
}

export function getAgentStreamOptions({
  req,
  agent,
  chatId,
  uiMessages,
  model,
}: {
  req: FrogbotRequest;
  agent: AgentInstance;
  chatId?: DocID;
  uiMessages: UIMessage[];
  model?: AgentInstance['config']['model'];
}): Parameters<typeof createAgentUIStreamResponse>[0] {
  const resolvedModel = resolveModel(model ?? agent.config.model, req.frogbot.config.ai!);
  return {
    agent: agent.aiAgent,
    uiMessages,
    originalMessages: uiMessages as never,
    generateMessageId: generateId,
    consumeSseStream: consumeStream,
    sendSources: true,
    messageMetadata: ({ part }) =>
      part.type === 'finish'
        ? { usage: createMessageUsage(part.totalUsage, resolvedModel) }
        : undefined,
    onFinish:
      chatId === undefined
        ? undefined
        : ({ responseMessage, isContinuation }) =>
            persistAssistantMessage({ req, chatId, message: responseMessage, isContinuation }),
    options: { req, overrideAccess: true, model },
    abortSignal: req.signal ?? undefined,
    headers: chatId !== undefined ? { 'X-Frogbot-Chat-Id': String(chatId) } : undefined,
  };
}

export async function generateAgentRequest({
  req,
  agent,
  chatId,
  uiMessages,
  model,
}: {
  req: FrogbotRequest;
  agent: AgentInstance;
  chatId?: DocID;
  uiMessages: UIMessage[];
  model?: AgentInstance['config']['model'];
}) {
  const result = await agent.aiAgent.generate({
    messages: await convertToModelMessages(uiMessages, { tools: agent.aiAgent.tools }),
    options: { req, overrideAccess: true, chatId, model },
    abortSignal: req.signal ?? undefined,
  });
  if (chatId !== undefined) {
    const message = await generateMessage({
      result,
      originalMessages: uiMessages,
      tools: agent.aiAgent.tools,
      model: resolveModel(model ?? agent.config.model, req.frogbot.config.ai!),
    });
    await persistAssistantMessage({ req, chatId, message, isContinuation: false });
  }
  return result;
}
