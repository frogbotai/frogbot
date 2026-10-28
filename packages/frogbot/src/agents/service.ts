import type { ReasoningVariant } from '@frogbotai/gateway';

import { enforceAIAccess } from '../ai/access.js';
import { resolveModelInputs } from '../ai/modelInputs.js';
import { resolveModelName } from '../ai/modelName.js';
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

  if ((await userDefaultModel({ agent, req })) === undefined) {
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

    const models = await userAgentModels({ agent, req });
    const defaultModel = defaultAgentModel({ agent, models });

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

export async function assertAgentSelection({
  agent,
  config,
  selection,
  req,
}: {
  agent: AgentInstance;
  config: SanitizedAIConfig;
  selection: AgentSelection;
  req: FrogBotRequest;
}): Promise<ResolvedAgentSelection> {
  const model = selection.model ?? (await userDefaultModel({ agent, req }));

  if (selection.model !== undefined && !agentModels(agent).includes(selection.model)) {
    throw new AgentServiceError(`Model '${model}' is not allowed for agent '${agent.slug}'`, 403);
  }

  if (model === undefined) {
    throw new AgentServiceError(`No model on agent '${agent.slug}' is allowed for this user`, 403);
  }

  if (selection.model !== undefined && !(await canUseModel({ req, model }))) {
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

async function canUseModel({ req, model }: { req: FrogBotRequest; model: string }) {
  const config = req.frogbot.config.ai;

  if (!req.user || !config) return true;

  try {
    await enforceAIAccess({ req, method: 'generateText', model, config });

    return true;
  } catch (error) {
    if (isAccessDenial(error)) return false;

    throw error;
  }
}

function isAccessDenial(error: unknown): boolean {
  return error instanceof Error && typeof (error as { status?: unknown }).status === 'number';
}

export async function userAgentModels({
  agent,
  req,
}: {
  agent: AgentInstance;
  req: FrogBotRequest;
}): Promise<AgentModelId[]> {
  const models: AgentModelId[] = [];

  for (const model of agentModels(agent)) {
    if (await canUseModel({ req, model })) models.push(model);
  }

  return models;
}

function defaultAgentModel({
  agent,
  models,
}: {
  agent: AgentInstance;
  models: AgentModelId[];
}): AgentModelId | undefined {
  return models.includes(agent.config.model.default) ? agent.config.model.default : models[0];
}

export async function userDefaultModel({
  agent,
  req,
}: {
  agent: AgentInstance;
  req: FrogBotRequest;
}): Promise<AgentModelId | undefined> {
  return defaultAgentModel({ agent, models: await userAgentModels({ agent, req }) });
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
