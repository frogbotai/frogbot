import type { ReasoningVariant } from '@frogbotai/gateway';
import type { AgentErrorCode, AgentModelNotice } from '@frogbotai/protocol';

import { canUseAIModel } from '../ai/access.js';
import { resolveModelInputs } from '../ai/modelInputs.js';
import { resolveModelName } from '../ai/modelName.js';
import { linkedNotices, narrowToLinkedModels } from '../ai/providerModels.js';
import { resolveModelReasoning } from '../ai/reasoning.js';
import { resolveModel } from '../ai/resolve.js';
import type { SanitizedAIConfig } from '../ai/types.js';
import type { ManifestResponse } from '../chat/types.js';
import { pieceToolInstance } from '../pieces/definePiece.js';
import { isClientTool } from '../tools/types.js';
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

export type { AgentErrorCode };

export class AgentServiceError extends Error {
  readonly code?: AgentErrorCode;

  constructor(
    message: string,
    readonly status: number,
    options: { code?: AgentErrorCode; cause?: unknown } = {},
  ) {
    super(message, 'cause' in options ? { cause: options.cause } : undefined);

    if (options.code) this.code = options.code;
  }
}

export function getAgent({ req, slug }: { req: FrogBotRequest; slug?: string }): AgentInstance {
  const agent = slug ? req.frogbot.agents[slug] : undefined;
  if (!agent) {
    throw new AgentServiceError(`Agent '${slug ?? ''}' not found`, 404, {
      code: 'agent-not-found',
    });
  }

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

  let allowed: unknown;

  try {
    allowed = await access({ req, agent });
  } catch (error) {
    req.frogbot.logger.error({ err: error, agent: agent.slug }, '[frogbot] Agent access threw');

    throw new AgentServiceError(
      `Access function for agent '${agent.slug}' threw: ${String(error)}`,
      500,
      { code: 'access-error', cause: error },
    );
  }

  if (allowed) return;

  if (!req.user) {
    throw new AgentServiceError('Authentication required', 401, { code: 'unauthenticated' });
  }

  throw new AgentServiceError(`Access denied for agent '${agent.slug}'`, 403, {
    code: 'access-denied',
  });
}

/** Whether `error` is `assertAgentAccess` refusing the caller, as opposed to failing. */
export function isAgentAccessDenial(error: unknown): boolean {
  return (
    error instanceof AgentServiceError &&
    (error.code === 'access-denied' || error.code === 'unauthenticated')
  );
}

const agentAccessChecked = Symbol('frogbot.agentAccessChecked');

/** Marks inner run options whose entry point already ran `assertAgentAccess`. */
export function withAgentAccessChecked<T extends object>(options: T): T {
  return { ...options, [agentAccessChecked]: true };
}

export function isAgentAccessChecked(options: object): boolean {
  return (options as { [agentAccessChecked]?: true })[agentAccessChecked] === true;
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
    if (isAgentAccessDenial(error)) return false;

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

  for (const agent of await listableAgents({ req })) {
    agents.push({
      slug: agent.slug,
      ...(agent.config.profile ? { profile: agent.config.profile } : {}),
    });
  }

  return agents;
}

async function listableAgents({ req }: { req: FrogBotRequest }): Promise<AgentInstance[]> {
  const listable: AgentInstance[] = [];

  for (const agent of Object.values(req.frogbot.agents)) {
    if (await hasAgentAccess({ req, agent }).catch(() => false)) listable.push(agent);
  }

  return listable;
}

export async function getAgentManifest({ req }: { req: FrogBotRequest }): Promise<AgentManifest> {
  const agents: AgentManifest['agents'] = [];
  const config = req.frogbot.config.ai;
  const notices = config?.linkedProviders ? await linkedNotices({ req, config }) : {};

  for (const agent of await listableAgents({ req })) {
    const models = await userAgentModels({ agent, req });
    const defaultModel = defaultAgentModel({ agent, models });

    if (defaultModel === undefined) continue;

    const names = agentNames({ config: req.frogbot.config.ai!, models });
    const reasoning = agentReasoning({ config: req.frogbot.config.ai!, models });
    const inputs = agentInputs({ config: req.frogbot.config.ai!, models });
    const shown = agentNotices({ notices, models });

    agents.push({
      slug: agent.slug,
      label: agent.config.profile?.name ?? agent.slug,
      source: 'config',
      defaultModel,
      models,
      ...(names ? { names } : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(inputs ? { inputs } : {}),
      ...(shown ? { notices: shown } : {}),
      ...(asksApproval(agent) ? { approval: true as const } : {}),
    });
  }

  return { defaultAgent: agents[0]?.slug ?? '', agents };
}

function asksApproval(agent: AgentInstance): boolean {
  return (
    (agent.config.tools ?? []).some((tool) => !isClientTool(tool) && !!tool.approval) ||
    (agent.config.mcp ?? []).some((server) =>
      Object.values(server.tools ?? {}).some(({ approval }) => !!approval),
    )
  );
}

function agentNotices({
  notices,
  models,
}: {
  notices: Record<string, AgentModelNotice>;
  models: readonly AgentModelId[];
}): AgentManifestEntry['notices'] {
  const shown = Object.fromEntries(
    Object.entries(notices).filter(([provider]) =>
      models.some((model) => model.startsWith(`${provider}/`)),
    ),
  );

  return Object.keys(shown).length ? shown : undefined;
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
    throw new AgentServiceError(
      `Model '${model}' is not allowed for agent '${agent.slug}'. ${await allowedModels({ agent, req })}`,
      403,
      { code: 'model-not-allowed' },
    );
  }

  if (model === undefined) {
    throw new AgentServiceError(`No model on agent '${agent.slug}' is allowed for this user`, 403, {
      code: 'no-model-available',
    });
  }

  if (
    selection.model !== undefined &&
    !(await canUseAIModel({ req, method: 'generateText', model }))
  ) {
    throw new AgentServiceError(
      `Model '${model}' is not allowed for this user. ${await allowedModels({ agent, req })}`,
      403,
      { code: 'model-not-allowed' },
    );
  }

  if (selection.reasoning === undefined) return { model: resolveModel(model, config) };

  const variants = resolveModelReasoning({ config, model });
  const variant = variants.find(({ key }) => key === selection.reasoning);

  if (!variant) {
    throw new AgentServiceError(
      `Reasoning option '${selection.reasoning}' is not available for model '${model}'. ${
        variants.length
          ? allowedList(variants.map(({ key }) => key))
          : 'It has no reasoning options'
      }`,
      400,
      { code: 'reasoning-unavailable' },
    );
  }

  return { model: resolveModel(model, config), variant };
}

async function allowedModels({
  agent,
  req,
}: {
  agent: AgentInstance;
  req: FrogBotRequest;
}): Promise<string> {
  return allowedList(await userAgentModels({ agent, req }));
}

function allowedList(values: readonly string[]): string {
  return values.length
    ? `Allowed: ${values.map((value) => `'${value}'`).join(', ')}`
    : 'Allowed: none';
}

function agentModels(agent: AgentInstance): readonly AgentModelId[] {
  return agent.config.model.options;
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
    if (await canUseAIModel({ req, method: 'generateText', model })) models.push(model);
  }

  const config = req.frogbot.config.ai;

  return config?.linkedProviders ? narrowToLinkedModels({ req, config, models }) : models;
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
