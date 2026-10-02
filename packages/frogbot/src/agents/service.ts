import type { ReasoningVariant } from '@frogbotai/gateway';

import { resolveModelInputs } from '../ai/modelInputs.js';
import { resolveModelName } from '../ai/modelName.js';
import { isTargetAllowed, resolvePolicy } from '../ai/policy.js';
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

export async function canUseAgent({
  req,
  agent,
}: {
  req: FrogBotRequest;
  agent: AgentInstance;
}): Promise<{ allowed: true } | { allowed: false; denied: 'access' | 'models' }> {
  if (!(await hasAgentAccess({ req, agent }))) return { allowed: false, denied: 'access' };

  if (userDefaultModel({ agent, user: req.user }) === undefined) {
    return { allowed: false, denied: 'models' };
  }

  return { allowed: true };
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

    const models = userAgentModels({ agent, user: req.user });
    const defaultModel = userDefaultModel({ agent, user: req.user });

    if (defaultModel === undefined) continue;

    const names = agentNames({ config: req.frogbot.config.ai!, models });
    const reasoning = agentReasoning({ config: req.frogbot.config.ai!, models });
    const inputs = agentInputs({ config: req.frogbot.config.ai!, models });

    agents.push({
      slug: agent.slug,
      label: agent.config.profile?.name ?? agent.slug,
      source: 'config',
      defaultModel,
      models,
      ...(names ? { names } : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(inputs ? { inputs } : {}),
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
  user,
}: {
  agent: AgentInstance;
  config: SanitizedAIConfig;
  selection: AgentSelection;
  user: FrogBotRequest['user'] | undefined;
}): ResolvedAgentSelection {
  const model = selection.model ?? userDefaultModel({ agent, user });

  if (selection.model !== undefined && !agentModels(agent).includes(selection.model)) {
    throw new AgentServiceError(`Model '${model}' is not allowed for agent '${agent.slug}'`, 403);
  }

  if (model === undefined) {
    throw new AgentServiceError(`No model on agent '${agent.slug}' is allowed for this user`, 403);
  }

  if (!isTargetAllowed(resolvePolicy(user), model)) {
    throw new AgentServiceError(`Model '${model}' is not allowed for this user`, 403);
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

function agentModels(agent: AgentInstance): readonly AgentModelId[] {
  return agent.config.model.options;
}

export function userAgentModels({
  agent,
  user,
}: {
  agent: AgentInstance;
  user: FrogBotRequest['user'] | undefined;
}): AgentModelId[] {
  const policy = resolvePolicy(user);

  return agentModels(agent).filter((model) => isTargetAllowed(policy, model));
}

export function userDefaultModel({
  agent,
  user,
}: {
  agent: AgentInstance;
  user: FrogBotRequest['user'] | undefined;
}): AgentModelId | undefined {
  const models = userAgentModels({ agent, user });

  return models.includes(agent.config.model.default) ? agent.config.model.default : models[0];
}

function agentNames({
  config,
  models,
}: {
  config: SanitizedAIConfig;
  models: AgentModelId[];
}): AgentManifestEntry['names'] {
  const names: NonNullable<AgentManifestEntry['names']> = {};

  for (const model of models) {
    const name = resolveModelName({ config, model });

    if (name?.trim()) names[model] = name;
  }

  return Object.keys(names).length === 0 ? undefined : names;
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

function agentInputs({
  config,
  models,
}: {
  config: SanitizedAIConfig;
  models: AgentModelId[];
}): AgentManifestEntry['inputs'] {
  const inputs: NonNullable<AgentManifestEntry['inputs']> = {};

  for (const model of models) {
    const resolved = resolveModelInputs({ config, model }).inputs;

    if (resolved) inputs[model] = resolved;
  }

  return Object.keys(inputs).length === 0 ? undefined : inputs;
}
