import type { ManifestResponse } from '../chat/types.js';
import { pieceToolInstance } from '../pieces/definePiece.js';
import type { FrogBotRequest } from '../types/request.js';
import type { AgentInstance, AgentManifest } from './types.js';

export class AgentServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function getAgent({ req, slug }: { req: FrogBotRequest; slug?: string }): AgentInstance {
  const agent = slug ? req.frogbot.agents[slug] : undefined;
  if (!agent) throw new AgentServiceError(`Agent '${slug ?? ''}' not found`, 404);
  return agent;
}

export async function assertAgentAccess({
  req,
  agent,
}: {
  req: FrogBotRequest;
  agent: AgentInstance;
}): Promise<void> {
  const access =
    agent.config.access ?? (({ req: current }: { req: FrogBotRequest }) => !!current.user);
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
  req: FrogBotRequest;
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

export async function getAgentManifest({ req }: { req: FrogBotRequest }): Promise<AgentManifest> {
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
  req: FrogBotRequest;
  agent: AgentInstance;
}) {
  return (
    req.frogbot.connections?.authorizations({
      req,
      pieces: [
        ...new Set(
          (agent.config.tools ?? []).flatMap((tool) => {
            const piece = pieceToolInstance(tool);
            return piece ? [piece] : [];
          }),
        ),
      ],
    }) ?? []
  );
}

export function assertAllowedModel({
  agent,
  model,
}: {
  agent: AgentInstance;
  model?: string;
}): AgentInstance['config']['model'] | undefined {
  const models = new Set<string>([agent.config.model, ...(agent.config.allowModels ?? [])]);

  if (model !== undefined && !models.has(model)) {
    throw new AgentServiceError(`Model '${model}' is not allowed for agent '${agent.slug}'`, 403);
  }

  return model as AgentInstance['config']['model'] | undefined;
}
