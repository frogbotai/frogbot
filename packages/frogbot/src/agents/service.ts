import type { ReasoningVariant } from '@frogbotai/gateway';

import { resolveModelReasoning } from '../ai/reasoning.js';
import { resolveModel } from '../ai/resolve.js';
import type { SanitizedAIConfig } from '../ai/types.js';
import type { ManifestResponse } from '../chat/types.js';
import { pieceToolInstance } from '../pieces/definePiece.js';
import type { FrogBotRequest } from '../types/request.js';
import type {
  AgentInstance,
  AgentManifest,
  AgentManifestEntry,
  AgentModelId,
  AgentSelection,
} from './types.js';

export type ResolvedAgentSelection = {
  model: string;
  variant?: ReasoningVariant;
};

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

export async function hasAgentAccess({
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

    const models = agentModels(agent);
    const reasoning = agentReasoning({ config: req.frogbot.config.ai!, models });

    agents.push({
      slug: agent.slug,
      label: agent.config.profile?.name ?? agent.slug,
      source: 'config',
      defaultModel: agent.config.model,
      models,
      ...(reasoning ? { reasoning } : {}),
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

export function assertAgentSelection({
  agent,
  config,
  selection,
}: {
  agent: AgentInstance;
  config: SanitizedAIConfig;
  selection: AgentSelection;
}): ResolvedAgentSelection {
  const model = selection.model ?? agent.config.model;

  if (!agentModels(agent).includes(model)) {
    throw new AgentServiceError(`Model '${model}' is not allowed for agent '${agent.slug}'`, 403);
  }

  if (selection.reasoning === undefined) return { model: resolveModel(model, config) };

  const variant = resolveModelReasoning({ config, model }).find(
    ({ key }) => key === selection.reasoning,
  );

  if (!variant) {
    throw new AgentServiceError(
      `Reasoning option '${selection.reasoning}' is not available for model '${model}'`,
      400,
    );
  }

  return { model: resolveModel(model, config), variant };
}

function agentModels(agent: AgentInstance): AgentModelId[] {
  return [...new Set([agent.config.model, ...(agent.config.allowModels ?? [])])];
}

function agentReasoning({
  config,
  models,
}: {
  config: SanitizedAIConfig;
  models: AgentModelId[];
}): AgentManifestEntry['reasoning'] {
  const reasoning: NonNullable<AgentManifestEntry['reasoning']> = {};

  for (const model of models) {
    const variants = resolveModelReasoning({ config, model });

    if (variants.length > 0) reasoning[model] = variants.map(({ key, label }) => ({ key, label }));
  }

  return Object.keys(reasoning).length === 0 ? undefined : reasoning;
}
