// Sanitize a FrogBot config into two outputs:
//   1. A `FrogbotSanitizedConfig` — FrogBot's own metadata preserved.
//   2. A Payload-shaped config stored in `_internal.payloadConfig`.
//
// Concerns:
//   1. Reject `globals` at runtime with a clear `[frogbot]` error.
//   2. Inject the `req.frogbot` bootstrap into every collection's
//      `beforeOperation` hooks.
//   3. Wrap every custom endpoint handler (root and per-collection) so
//      `req.frogbot` is attached before the user's handler executes.

import type {
  CollectionConfig as PayloadCollectionConfig,
  Config as PayloadConfig,
  Endpoint as PayloadEndpoint,
  PayloadEmailAdapter,
  PayloadHandler,
  PayloadRequest,
} from "payload";
import { buildConfig as payloadBuildConfig } from "payload";
import { Cron } from "croner";

import { buildAgentEndpoints } from "../agents/endpoints.js";
import {
  AGENT_SCHEDULE_TASK_SLUG,
  everyToCron,
  resolveScheduleTasks,
} from "../agents/resolveScheduleTasks.js";
import { isKnownModelId } from "../ai/catalog.js";
import { getGatewayProviderName, isProviderName } from "../ai/providerNames.js";
import { resolveUsageCollection } from "../ai/usageCollection.js";
import { buildManifestEndpoint } from "../chat/manifest.js";
import { resolveChatCollections } from "../chat/resolveChatCollections.js";
import { resolveConnectionsCollections } from "../connections/resolveCollections.js";
import {
  buildSecretEndpoints,
  builtInDeveloperSources,
  builtInSecretSource,
} from "../connections/secret.js";
import { resolveCredentialSources } from "../connections/sources.js";
import { resolveFilesCollection } from "../files/resolveCollections.js";
import type { Frogbot } from "../frogbot.js";
import { initFrogbotFromPayload } from "../frogbot.js";
import { seedFrogbotCache } from "../getFrogbot.js";
import { ensureFrogbotInstance } from "../instanceRegistry.js";
import { buildSkillTools } from "../skills/tools.js";
import type { AgentConfig } from "../types/agent.js";
import type { AIConfig, RouterConfig, SanitizedAIConfig } from "../types/ai.js";
import type { SkillConfig } from "../types/skill.js";
import type { CollectionConfig } from "../types/collection.js";
import { COLLECTION_MARKERS } from "../types/collection.js";
import type { FrogbotConfig } from "../types/config.js";
import type { Endpoint } from "../types/endpoint.js";
import type { Piece, SanitizedPiecesConfig } from "../types/piece.js";
import type { FrogbotRequest } from "../types/request.js";
import type {
  FrogbotSanitizedConfig,
  SanitizedCollectionMeta,
} from "../types/sanitized.js";
import type { AnyTool } from "../types/tool.js";
import { rewriteComponentPaths } from "./rewriteComponentPaths.js";
import { resolveSourceDir } from "./sourceDir.js";
import type { ValidationMode } from "./validationContext.js";
import { getValidationMode } from "./validationContext.js";

const noopEmailAdapter: PayloadEmailAdapter<void> = ({ payload }) => ({
  name: "frogbot-noop",
  defaultFromAddress: "noop@frogbot.local",
  defaultFromName: "FrogBot",
  sendEmail(message) {
    payload.logger.warn(
      `[frogbot] Email attempted without a configured adapter. To: '${String(message.to)}', Subject: '${String(message.subject)}'. ` +
        `Configure an email adapter to send real emails.`,
    );
    return Promise.resolve();
  },
});

type AttachFrogbot = (req: PayloadRequest) => Promise<FrogbotRequest>;

async function bootstrapBeforeOperation(
  args: { req: PayloadRequest },
  attachFrogbot: AttachFrogbot,
): Promise<void> {
  await attachFrogbot(args.req);
}

function wrapEndpointHandler(
  handler: PayloadHandler,
  attachFrogbot: AttachFrogbot,
): PayloadHandler {
  return async (req) => {
    await attachFrogbot(req);
    return handler(req);
  };
}

function wrapRootHooks(
  hooks: FrogbotConfig["hooks"],
  attachFrogbot: AttachFrogbot,
): PayloadConfig["hooks"] {
  if (!hooks?.afterError) return hooks as PayloadConfig["hooks"];
  return {
    afterError: hooks.afterError.map(
      (hook) => async (args) => {
        if (!args.req.payload) return hook(args as never);
        return hook({ ...args, req: await attachFrogbot(args.req) });
      },
    ),
  };
}

function wrapEndpoints(
  endpoints: Endpoint[] | false | undefined,
  attachFrogbot: AttachFrogbot,
): PayloadEndpoint[] | false | undefined {
  if (!endpoints) return endpoints;
  return endpoints.map((e) => ({
    ...e,
    handler: wrapEndpointHandler(
      e.handler as unknown as PayloadHandler,
      attachFrogbot,
    ),
  }));
}

function sanitizeCollection(
  c: CollectionConfig,
  attachFrogbot: AttachFrogbot,
): PayloadCollectionConfig {
  const out: Record<string, unknown> = {
    ...(c as unknown as Record<string, unknown>),
  };

  // Strip chat role markers — FrogBot-only keys.
  for (const marker of COLLECTION_MARKERS) {
    delete out[marker];
  }

  // Capture auth state into `custom.frogbot`.
  const auth = c.auth !== undefined && c.auth !== false;
  const existingCustom = (c.custom ?? {}) as Record<string, unknown>;
  out.custom = {
    ...existingCustom,
    frogbot: { auth },
  };

  // Inject `req.frogbot` bootstrap as the first `beforeOperation`.
  const existingHooks = (c.hooks ?? {}) as Record<string, unknown[]>;
  const existingBeforeOp =
    (existingHooks.beforeOperation as unknown[] | undefined) ?? [];
  out.hooks = {
    ...existingHooks,
    beforeOperation: [
      (args: { req: PayloadRequest }) =>
        bootstrapBeforeOperation(args, attachFrogbot),
      ...existingBeforeOp,
    ],
  };

  // Wrap per-collection custom endpoints.
  if (c.endpoints !== undefined) {
    out.endpoints = wrapEndpoints(c.endpoints, attachFrogbot);
  }

  return out as unknown as PayloadCollectionConfig;
}

// ─── AI Config Sanitization ──────────────────────────────────────────────────

const defaultAccessFn = ({ req }: { req: FrogbotRequest }) => !!req.user;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type SanitizedAIBase = Omit<SanitizedAIConfig, "usage">;

function sanitizeAI(ai: AIConfig): SanitizedAIBase {
  // Validate providers.
  if (!isRecord(ai.providers)) {
    throw new Error(
      "[frogbot] `ai.providers` is required and must be an object.",
    );
  }
  const configured = Object.values(ai.providers).filter(
    (entry) => entry != null,
  );
  if (configured.length === 0) {
    throw new Error(
      "[frogbot] At least one AI provider must be configured under `ai.providers`.",
    );
  }
  for (const [key, entry] of Object.entries(ai.providers)) {
    if (entry === undefined) {
      continue;
    }
    if (!key.trim()) {
      throw new Error("[frogbot] AI provider names must not be empty.");
    }
    if (entry === true) {
      if (!isProviderName(key)) {
        throw new Error(
          `[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`,
        );
      }
      continue;
    }
    if (!isRecord(entry)) {
      throw new Error(`[frogbot] Provider '${key}' must be true or an object.`);
    }
    const provider: Record<string, unknown> = entry;
    if ("type" in provider || "baseUrl" in provider) {
      const custom = provider;
      if (custom.type !== "openai-compatible") {
        throw new Error(
          `[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`,
        );
      }
      if (typeof custom.baseUrl !== "string" || !custom.baseUrl.trim()) {
        throw new Error(
          `[frogbot] Custom provider '${key}' requires a baseUrl.`,
        );
      }
      if (
        !custom.models ||
        !Array.isArray(custom.models) ||
        custom.models.length === 0
      ) {
        throw new Error(
          `[frogbot] Custom provider '${key}' requires a non-empty models array.`,
        );
      }
      for (const model of custom.models) {
        if (
          !isRecord(model) ||
          typeof model.id !== "string" ||
          !model.id.trim() ||
          !model.mode
        ) {
          throw new Error(
            `[frogbot] Every model for custom provider '${key}' requires an id and mode.`,
          );
        }
      }
      continue;
    }
    if (!isProviderName(key)) {
      throw new Error(
        `[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`,
      );
    }
    if (provider.models !== undefined) {
      if (!Array.isArray(provider.models)) {
        throw new Error(
          `[frogbot] Provider '${key}' models must be an array.`,
        );
      }
      const gatewayProvider = getGatewayProviderName(key);
      for (const model of provider.models) {
        if (
          typeof model !== "string" ||
          !isKnownModelId(`${gatewayProvider}/${model}`, new Set([gatewayProvider]))
        ) {
          throw new Error(
            `[frogbot] Provider '${key}' models contains unknown model: ${String(model)}.`,
          );
        }
      }
    }
    if (key === "bedrock") {
      const hasRegion =
        typeof provider.region === "string" && !!provider.region.trim();
      const hasAccessKey =
        typeof provider.accessKeyId === "string" &&
        !!provider.accessKeyId.trim();
      const hasSecretKey =
        typeof provider.secretAccessKey === "string" &&
        !!provider.secretAccessKey.trim();
      const hasCredentialProvider =
        typeof provider.credentialProvider === "function";
      if (
        !hasRegion &&
        !hasAccessKey &&
        !hasSecretKey &&
        !hasCredentialProvider
      ) {
        throw new Error(
          `[frogbot] Provider 'bedrock' requires a region or explicit AWS credentials.`,
        );
      }
      if (hasAccessKey !== hasSecretKey) {
        throw new Error(
          `[frogbot] Provider 'bedrock' requires both accessKeyId and secretAccessKey when either is set.`,
        );
      }
      continue;
    }
    if (typeof provider.apiKey !== "string" || !provider.apiKey.trim()) {
      throw new Error(
        `[frogbot] Provider '${key}' requires a non-empty apiKey when configured with an object.`,
      );
    }
  }

  // Validate routers.
  if (ai.routers !== undefined && !isRecord(ai.routers)) {
    throw new Error("[frogbot] `ai.routers` must be an object.");
  }
  const routers: Record<string, RouterConfig> = ai.routers ?? {};
  if (ai.defaultRouter && !routers[ai.defaultRouter]) {
    throw new Error(
      `[frogbot] defaultRouter '${ai.defaultRouter}' does not exist in ai.routers.`,
    );
  }

  for (const [slug, router] of Object.entries(routers)) {
    if (
      !isRecord(router) ||
      typeof router.model !== "string" ||
      !router.model.trim()
    ) {
      throw new Error(`[frogbot] Router '${slug}' requires a model.`);
    }
  }

  // Normalize hooks to arrays.
  const hooks = {
    beforeOperation: ai.hooks?.beforeOperation ?? [],
    beforeUpstream: ai.hooks?.beforeUpstream ?? [],
    afterUpstream: ai.hooks?.afterUpstream ?? [],
    afterError: ai.hooks?.afterError ?? [],
    afterOperation: ai.hooks?.afterOperation ?? [],
  };

  // Apply access defaults.
  const access = {
    generate: ai.access?.generate ?? defaultAccessFn,
    embed: ai.access?.embed ?? defaultAccessFn,
    transcribe: ai.access?.transcribe ?? defaultAccessFn,
    rerank: ai.access?.rerank ?? defaultAccessFn,
  };

  // Deployment identifier for telemetry spans.
  const _internal = {
    deploymentId:
      ai.deploymentId ?? process.env.FROGBOT_DEPLOYMENT_ID ?? "local",
  };

  // Telemetry — default enabled, user opts out via { enabled: false }.
  const telemetry = {
    enabled: ai.telemetry?.enabled !== false,
    enrichSpan: ai.telemetry?.enrichSpan,
  };

  return {
    providers: ai.providers,
    routers,
    defaultRouter: ai.defaultRouter,
    hooks,
    access,
    telemetry,
    _internal,
  };
}

function sanitizeToolList(
  tools: readonly AnyTool[],
  pieces: SanitizedPiecesConfig,
  contextLabel: string,
): AnyTool[] {
  const context = `${contextLabel[0].toLowerCase()}${contextLabel.slice(1)}`;
  const toolSlugs = new Set<string>();
  return tools.map((configuredTool) => {
    let tool = configuredTool;
    if (
      !isRecord(tool) ||
      typeof tool.slug !== "string" ||
      !tool.slug.trim()
    ) {
      throw new Error(
        `[frogbot] A tool in ${context} is missing a \`slug\`.`,
      );
    }
    if (typeof tool.pieceService === "string") {
      const registered = pieces.services[tool.pieceService];
      if (!registered)
        {throw new Error(
          `[frogbot] ${contextLabel} uses tool '${tool.slug}' but no '${tool.pieceService}' piece is registered in \`pieces\`.`,
        );}
      const resolved = pieces.tools[tool.slug];
      if (!resolved)
        {throw new Error(
          `[frogbot] Piece '${tool.pieceService}' has no registered tool '${tool.slug}'.`,
        );}
      tool = resolved;
    }
    if (toolSlugs.has(tool.slug)) {
      throw new Error(
        `[frogbot] Duplicate tool slug '${tool.slug}' in ${context}.`,
      );
    }
    if (typeof tool.description !== "string" || !tool.description.trim()) {
      throw new Error(
        `[frogbot] Tool '${tool.slug}' in ${context} requires a description.`,
      );
    }
    if (!tool.inputSchema || typeof tool.execute !== "function") {
      throw new Error(
        `[frogbot] Tool '${tool.slug}' in ${context} requires inputSchema and execute.`,
      );
    }
    toolSlugs.add(tool.slug);
    return tool;
  });
}

function sanitizeSkills(agentSlug: string, skills: readonly SkillConfig[]): void {
  const skillSlugs = new Set<string>();
  for (const skill of skills) {
    if (
      !isRecord(skill) ||
      typeof skill.slug !== "string" ||
      !skill.slug.trim()
    ) {
      throw new Error(
        `[frogbot] Agent '${agentSlug}' has a skill missing a \`slug\`.`,
      );
    }
    if (
      skill.slug !== skill.slug.trim() ||
      encodeURIComponent(skill.slug) !== skill.slug
    ) {
      throw new Error(
        `[frogbot] Skill slug '${skill.slug}' in agent '${agentSlug}' is not URL-safe.`,
      );
    }
    if (skillSlugs.has(skill.slug)) {
      throw new Error(
        `[frogbot] Duplicate skill slug '${skill.slug}' in agent '${agentSlug}'.`,
      );
    }
    skillSlugs.add(skill.slug);
    if (
      typeof skill.instructions !== "function" &&
      (typeof skill.instructions !== "string" || !skill.instructions.trim())
    ) {
      throw new Error(
        `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' requires instructions.`,
      );
    }
    for (const field of ["description", "license", "compatibility"] as const) {
      const value = skill[field];
      if (value !== undefined && (typeof value !== "string" || !value.trim())) {
        throw new Error(
          `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' ${field} must be a non-empty string.`,
        );
      }
    }
    if (
      skill.metadata !== undefined &&
      (!isRecord(skill.metadata) ||
        Object.values(skill.metadata).some((value) => typeof value !== "string"))
    ) {
      throw new Error(
        `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' metadata must contain only string values.`,
      );
    }
    if (skill.resources === undefined) continue;
    if (!Array.isArray(skill.resources)) {
      throw new Error(
        `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' resources must be an array.`,
      );
    }
    const paths = new Set<string>();
    for (const resource of skill.resources) {
      if (
        !isRecord(resource) ||
        typeof resource.path !== "string" ||
        !resource.path.trim()
      ) {
        throw new Error(
          `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' has a resource missing a path.`,
        );
      }
      if (paths.has(resource.path)) {
        throw new Error(
          `[frogbot] Duplicate resource path '${resource.path}' in skill '${skill.slug}'.`,
        );
      }
      paths.add(resource.path);
      if (
        resource.description !== undefined &&
        (typeof resource.description !== "string" || !resource.description.trim())
      ) {
        throw new Error(
          `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' resource '${resource.path}' description must be a non-empty string.`,
        );
      }
      if (
        typeof resource.content !== "function" &&
        (typeof resource.content !== "string" || !resource.content.trim())
      ) {
        throw new Error(
          `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' resource '${resource.path}' requires content.`,
        );
      }
    }
  }
}

function sanitizeAgents(
  agents: AgentConfig[],
  ai: SanitizedAIBase | undefined,
  pieces: SanitizedPiecesConfig,
  mode: ValidationMode,
  rootTools: AnyTool[],
): AgentConfig[] | undefined {
  if (!Array.isArray(agents)) {
    throw new Error("[frogbot] `agents` must be an array.");
  }
  if (agents.length === 0) {
    return undefined;
  }
  if (!ai) {
    throw new Error("[frogbot] `agents` requires an `ai` configuration block.");
  }

  const providers = new Set<string>(
    Object.entries(ai.providers)
      .filter(([, entry]) => entry != null)
      .map(([provider]) =>
        isProviderName(provider) ? getGatewayProviderName(provider) : provider,
      ),
  );
  const slugs = new Set<string>();

  return agents.map((agent) => {
    if (
      !isRecord(agent) ||
      typeof agent.slug !== "string" ||
      !agent.slug.trim()
    ) {
      throw new Error("[frogbot] Every agent must have a `slug`.");
    }
    if (
      agent.slug !== agent.slug.trim() ||
      encodeURIComponent(agent.slug) !== agent.slug
    ) {
      throw new Error(`[frogbot] Agent slug '${agent.slug}' is not URL-safe.`);
    }
    if (slugs.has(agent.slug)) {
      throw new Error(`[frogbot] Duplicate agent slug: '${agent.slug}'.`);
    }
    slugs.add(agent.slug);

    if (typeof agent.model !== "string" || !agent.model.trim()) {
      throw new Error(`[frogbot] Agent '${agent.slug}' requires a \`model\`.`);
    }
    if (typeof agent.instructions !== "string" || !agent.instructions.trim()) {
      throw new Error(
        `[frogbot] Agent '${agent.slug}' requires \`instructions\`.`,
      );
    }
    if (agent.profile !== undefined) {
      if (!isRecord(agent.profile)) {
        throw new Error(`[frogbot] Agent '${agent.slug}' profile must be an object.`);
      }
      for (const field of ["name", "avatar", "description"] as const) {
        const value = agent.profile[field];
        if (value !== undefined && (typeof value !== "string" || !value.trim())) {
          throw new Error(
            `[frogbot] Agent '${agent.slug}' profile ${field} must be a non-empty string.`,
          );
        }
      }
    }
    if (agent.access !== undefined && typeof agent.access !== "function") {
      throw new Error(
        `[frogbot] Agent '${agent.slug}' access must be a function.`,
      );
    }
    if (
      agent.stopWhen !== undefined &&
      typeof agent.stopWhen !== "function" &&
      (!Array.isArray(agent.stopWhen) ||
        agent.stopWhen.length === 0 ||
        agent.stopWhen.some((condition) => typeof condition !== "function"))
    ) {
      throw new Error(
        `[frogbot] Agent '${agent.slug}' stopWhen must contain at least one condition.`,
      );
    }

    const model = ai.routers[agent.model]?.model ?? agent.model;
    const separator = model.indexOf("/");
    const provider = separator > 0 ? model.slice(0, separator) : "";
    if (!provider || !providers.has(provider)) {
      const message = `[frogbot] Agent '${agent.slug}' model '${agent.model}' does not resolve to a configured provider. Configured providers: ${[...providers].join(", ")}. Update the agent model or configure its provider under \`ai.providers\`.`;
      if (mode === "runtime") throw new Error(message);
      console.warn(message);
    }

    let agentTools: AnyTool[] | undefined;
    if (agent.tools !== undefined) {
      if (!Array.isArray(agent.tools)) {
        throw new Error(
          `[frogbot] Agent '${agent.slug}' tools must be an array when configured.`,
        );
      }
      agentTools = sanitizeToolList(
        agent.tools,
        pieces,
        `Agent '${agent.slug}'`,
      );
    }
    if (agent.inheritTools !== false && rootTools.length > 0) {
      const agentToolSlugs = new Set(agentTools?.map(({ slug }) => slug));
      const inheritedTools = rootTools.filter(({ slug }) => !agentToolSlugs.has(slug));
      agent = { ...agent, tools: [...inheritedTools, ...(agentTools ?? [])] };
    } else if (agentTools !== undefined) {
      agent = { ...agent, tools: agentTools };
    }

    if (agent.skills !== undefined) {
      if (!Array.isArray(agent.skills)) {
        throw new Error(
          `[frogbot] Agent '${agent.slug}' skills must be an array when configured.`,
        );
      }
      sanitizeSkills(agent.slug, agent.skills);
      if (agent.skills.length > 0) {
        const toolSlugs = new Set(agent.tools?.map(({ slug }) => slug));
        for (const slug of [
          "list_skills",
          "load_skill",
          "load_skill_resource",
        ]) {
          if (toolSlugs.has(slug)) {
            throw new Error(
              `[frogbot] Tool slug '${slug}' is reserved for agent skills.`,
            );
          }
        }
        const skillLines = agent.skills.map(({ slug, description }) =>
          `- **${slug}**${description ? `: ${description}` : ""}`
        );
        agent = {
          ...agent,
          instructions: `${agent.instructions}\n\n${skillLines.join("\n")}`,
          tools: [...(agent.tools ?? []), ...buildSkillTools(agent.skills)],
        };
      }
    }

    if (agent.triggers !== undefined) {
      if (!Array.isArray(agent.triggers)) {
        throw new Error(
          `[frogbot] Agent '${agent.slug}' triggers must be an array when configured.`,
        );
      }
      const triggerSlugs = new Set<string>();
      for (const trigger of agent.triggers) {
        if (
          !isRecord(trigger) ||
          trigger.type !== "schedule" ||
          typeof trigger.slug !== "string" ||
          !trigger.slug.trim()
        ) {
          throw new Error(
            `[frogbot] Every trigger in agent '${agent.slug}' requires type 'schedule' and a slug.`,
          );
        }
        if (
          trigger.slug !== trigger.slug.trim() ||
          encodeURIComponent(trigger.slug) !== trigger.slug
        ) {
          throw new Error(
            `[frogbot] Trigger slug '${trigger.slug}' in agent '${agent.slug}' is not URL-safe.`,
          );
        }
        if (triggerSlugs.has(trigger.slug)) {
          throw new Error(
            `[frogbot] Duplicate trigger slug '${trigger.slug}' in agent '${agent.slug}'.`,
          );
        }
        triggerSlugs.add(trigger.slug);
        const hasPrompt = typeof trigger.prompt === "string";
        const hasHandler = typeof trigger.handler === "function";
        if (hasPrompt === hasHandler) {
          throw new Error(
            `[frogbot] Trigger '${trigger.slug}' in agent '${agent.slug}' requires exactly one of prompt or handler.`,
          );
        }
        if (hasPrompt && !(trigger.prompt as string).trim()) {
          throw new Error(
            `[frogbot] Trigger '${trigger.slug}' in agent '${agent.slug}' requires a non-empty prompt.`,
          );
        }
        if (!isRecord(trigger.schedule)) {
          throw new Error(
            `[frogbot] Trigger '${trigger.slug}' in agent '${agent.slug}' requires a schedule.`,
          );
        }
        const hasEvery = typeof trigger.schedule.every === "string";
        const hasCron = typeof trigger.schedule.cron === "string";
        if (hasEvery === hasCron) {
          throw new Error(
            `[frogbot] Trigger '${trigger.slug}' in agent '${agent.slug}' schedule requires exactly one of every or cron.`,
          );
        }
        if (trigger.schedule.timezone !== undefined) {
          throw new Error(
            `[frogbot] Trigger '${trigger.slug}' in agent '${agent.slug}' timezone is not yet supported. Cron schedules use UTC.`,
          );
        }
        const cron = hasEvery
          ? everyToCron(trigger.schedule.every as string)
          : (trigger.schedule.cron as string);
        try {
          new Cron(cron);
        } catch {
          throw new Error(
            `[frogbot] Trigger '${trigger.slug}' in agent '${agent.slug}' has an invalid cron expression: '${cron}'.`,
          );
        }
      }
    }

    return { ...agent, access: agent.access ?? defaultAccessFn };
  });
}

function sanitizePieces(pieces: Piece[] | undefined): SanitizedPiecesConfig {
  if (pieces === undefined)
    {return { enabled: false, pieces: [], services: {}, tools: {} };}
  if (!Array.isArray(pieces))
    {throw new Error("[frogbot] `pieces` must be an array.");}
  if (pieces.length === 0)
    {return { enabled: false, pieces: [], services: {}, tools: {} };}

  const services = new Set<string>();
  const serviceIndex: Record<string, Piece> = {};
  const toolIndex: Record<string, AnyTool> = {};
  for (const piece of pieces) {
    if (
      !isRecord(piece) ||
      typeof piece.service !== "string" ||
      !piece.service.trim()
    ) {
      throw new Error("[frogbot] Every piece must have a `service`.");
    }
    if (services.has(piece.service)) {
      throw new Error(`[frogbot] Duplicate piece service: '${piece.service}'.`);
    }
    services.add(piece.service);
    serviceIndex[piece.service] = piece;

    if (
      !Array.isArray(piece.actions) ||
      piece.actions.some(
        (action) => typeof action !== "string" || !action.trim(),
      )
    ) {
      throw new Error(
        `[frogbot] Piece '${piece.service}' actions must be non-empty strings.`,
      );
    }
    const actions = new Set(piece.actions);
    if (actions.size !== piece.actions.length) {
      throw new Error(
        `[frogbot] Piece '${piece.service}' declares duplicate actions.`,
      );
    }
    for (const tool of piece.tools()) {
      const prefix = `${piece.service}_`;
      const action = tool.slug.startsWith(prefix)
        ? tool.slug.slice(prefix.length)
        : "";
      if (!actions.has(action)) {
        throw new Error(
          `[frogbot] Piece '${piece.service}' exposes unknown action '${action || tool.slug}'.`,
        );
      }
      toolIndex[tool.slug] = tool;
    }
  }

  return { enabled: true, pieces, services: serviceIndex, tools: toolIndex };
}

function validateInternalPathReservations(
  config: Pick<FrogbotConfig, "collections" | "endpoints">,
): void {
  for (const [slug, api] of [
    ["agents", "agent"],
    ["frogbot", "manifest"],
  ] as const) {
    if (config.collections.some((collection) => collection.slug === slug)) {
      throw new Error(
        `[frogbot] Collection slug '${slug}' is reserved for the ${api} API.`,
      );
    }
  }

  const endpoints = (config as { endpoints?: Endpoint[] | false }).endpoints;
  if (
    endpoints !== undefined &&
    endpoints !== false &&
    !Array.isArray(endpoints)
  ) {
    throw new Error("[frogbot] `endpoints` must be an array or false.");
  }

  for (const endpoint of Array.isArray(endpoints) ? endpoints : []) {
    if (endpoint.path === "/agents" || endpoint.path.startsWith("/agents/")) {
      throw new Error(
        `[frogbot] Endpoint path '${endpoint.path}' is reserved for the agent API.`,
      );
    }
    if (endpoint.path === "/frogbot" || endpoint.path.startsWith("/frogbot/")) {
      throw new Error(
        `[frogbot] Endpoint path '${endpoint.path}' is reserved for the manifest API.`,
      );
    }
  }
}

// ─── Payload Config Building ─────────────────────────────────────────────────

function buildPayloadConfig(
  config: FrogbotConfig,
  onInit: NonNullable<PayloadConfig["onInit"]>,
  internalEndpoints: Endpoint[] = [],
  attachFrogbot: AttachFrogbot,
): PayloadConfig {
  const frogbotKeys = new Set([
    "agents",
    "ai",
    "connections",
    "credentialSources",
    "onInit",
    "pieces",
    "plugins",
    "port",
    "tools",
  ]);
  const collections = config.collections.map((collection) =>
    sanitizeCollection(collection, attachFrogbot),
  );
  if (!collections.some((collection) => Boolean(collection.auth))) {
    collections.push(
      sanitizeCollection(
        {
          slug: "users",
          admin: { useAsTitle: "name" },
          auth: { tokenExpiration: 7200 },
          fields: [{ name: "name", type: "text" }],
        },
        attachFrogbot,
      ),
    );
  }
  const out: Record<string, unknown> = {
    ...Object.fromEntries(
      Object.entries(config).filter(([key]) => !frogbotKeys.has(key)),
    ),
    collections,
    hooks: wrapRootHooks(config.hooks, attachFrogbot),
  };

  const userEndpoints = config.endpoints as Endpoint[] | false | undefined;
  const agentEndpoints = config.agents?.length ? buildAgentEndpoints() : [];
  const allEndpoints = [
    ...(Array.isArray(userEndpoints) ? userEndpoints : []),
    buildManifestEndpoint(),
    ...agentEndpoints,
    ...internalEndpoints,
  ];

  if (allEndpoints.length > 0) {
    out.endpoints = wrapEndpoints(allEndpoints, attachFrogbot);
  } else if (userEndpoints === false) {
    out.endpoints = false;
  } else if (userEndpoints !== undefined) {
    out.endpoints = wrapEndpoints(userEndpoints, attachFrogbot);
  }

  // Inject noop email adapter if none provided.
  if (!config.email) {
    out.email = noopEmailAdapter;
  }

  out.typescript = {
    ...(config as { typescript?: Record<string, unknown> }).typescript,
    autoGenerate: false,
  };
  out.cookiePrefix = config.cookiePrefix ?? "frogbot";

  const admin = (
    config as {
      admin?: {
        components?: { graphics?: Record<string, unknown> } & Record<
          string,
          unknown
        >;
        importMap?: Record<string, unknown>;
        meta?: { openGraph?: Record<string, unknown> } & Record<
          string,
          unknown
        >;
      } & Record<string, unknown>;
    }
  ).admin;
  out.admin = {
    ...admin,
    components: {
      ...admin?.components,
      graphics: {
        Icon: "@frogbotai/next/rsc#FrogbotIcon",
        Logo: "@frogbotai/next/rsc#FrogbotLogo",
        ...admin?.components?.graphics,
      },
    },
    meta: {
      defaultOGImageType: "static",
      titleSuffix: "- FrogBot",
      ...admin?.meta,
      openGraph: {
        description:
          "FrogBot is an open-source AI agent framework you configure in one TypeScript file, then deploy anywhere or run as a Docker image.",
        siteName: "FrogBot",
        ...admin?.meta?.openGraph,
      },
    },
    importMap: {
      baseDir: resolveSourceDir(process.cwd()),
      ...admin?.importMap,
      autoGenerate: false,
    },
  };

  const i18n = (
    config as {
      i18n?: { translations?: Record<string, unknown> } & Record<
        string,
        unknown
      >;
    }
  ).i18n;
  const en = i18n?.translations?.en as
    | ({ general?: Record<string, unknown> } & Record<string, unknown>)
    | undefined;
  out.i18n = {
    ...i18n,
    translations: {
      ...i18n?.translations,
      en: {
        ...en,
        general: {
          payloadSettings: "FrogBot Settings",
          ...en?.general,
        },
      },
    },
  };

  out.onInit = onInit;

  return out as unknown as PayloadConfig;
}

export function sanitize(
  config: FrogbotConfig,
  { mode = getValidationMode() }: { mode?: ValidationMode } = {},
): FrogbotSanitizedConfig {
  if ((config as unknown as Record<string, unknown>).globals !== undefined) {
    throw new Error(
      "[frogbot] `globals` is not a FrogBot concept. Use collections instead.",
    );
  }
  validateInternalPathReservations(config);
  const sanitizedConfigRef: { current?: FrogbotSanitizedConfig } = {};
  const attachFrogbot: AttachFrogbot = async (req) => {
    const sanitizedConfig = sanitizedConfigRef.current;
    if (!sanitizedConfig)
      {throw new Error(
        "[frogbot] Payload initialized before config sanitization completed.",
      );}
    const frogbot = await ensureFrogbotInstance(
      req.payload,
      () => initFrogbotFromPayload(req.payload, sanitizedConfig),
      sanitizedConfig,
    );
    seedFrogbotCache(frogbot, sanitizedConfig);
    (req as PayloadRequest & { frogbot: Frogbot }).frogbot = frogbot;
    return req as unknown as FrogbotRequest;
  };

  // Sanitize AI config if present.
  const sanitizedAI = config.ai ? sanitizeAI(config.ai) : undefined;
  const pieces = sanitizePieces(config.pieces);
  if (config.tools !== undefined && !Array.isArray(config.tools)) {
    throw new Error("[frogbot] Root tools must be an array when configured.");
  }
  const rootTools = sanitizeToolList(config.tools ?? [], pieces, "Root");
  const agents =
    config.agents !== undefined
      ? sanitizeAgents(
          config.agents,
          sanitizedAI,
          pieces,
          mode,
          rootTools,
        )
      : undefined;
  const hasScheduleTriggers = agents?.some((agent) => agent.triggers?.length);
  if (
    hasScheduleTriggers &&
    config.jobs?.tasks?.some((task) => task.slug === AGENT_SCHEDULE_TASK_SLUG)
  ) {
    throw new Error(
      `[frogbot] Job task slug '${AGENT_SCHEDULE_TASK_SLUG}' is reserved for agent schedule triggers.`,
    );
  }
  const jobs = resolveScheduleTasks({ agents, jobs: config.jobs });
  const secretSource = builtInSecretSource(pieces.pieces);
  const credentialSources = [
    ...(secretSource.services.length ? [secretSource] : []),
    ...builtInDeveloperSources(pieces.pieces),
    ...(config.credentialSources ?? []),
  ];

  // Resolve chat persistence — adopt marked collections or inject defaults.
  const chatResult = resolveChatCollections({ ...config, agents });
  const { collections: usageCollections, slug: usageSlug } = resolveUsageCollection(
    { ...config, agents, collections: chatResult.collections },
    chatResult.chat.enabled ? chatResult.chat.threadsSlug : undefined,
  );
  const connectionsResult = resolveConnectionsCollections(
    { ...config, agents, credentialSources, collections: usageCollections },
    pieces,
  );
  const { collections, files } = resolveFilesCollection({
    collections: connectionsResult.collections,
  });
  const connections = connectionsResult.connections;
  connections.assignments = resolveCredentialSources({
    sources: connections.sources,
    assignments: connections.assignments,
    pieces: pieces.pieces,
  });
  const chat = chatResult.chat;

  // Build collection metadata for FrogBot's sanitized config.
  const collectionsMeta: SanitizedCollectionMeta[] = collections.map((c) => ({
    slug: c.slug,
    auth: c.auth !== undefined && c.auth !== false,
  }));

  // Build the Payload config and pass it through Payload's buildConfig.
  const payloadConfig = buildPayloadConfig(
    { ...config, agents, collections, jobs },
    async (payload) => {
      const sanitizedConfig = sanitizedConfigRef.current;
      if (!sanitizedConfig)
        {throw new Error(
          "[frogbot] Payload initialized before config sanitization completed.",
        );}
      const frogbot = await ensureFrogbotInstance(
        payload,
        () => initFrogbotFromPayload(payload, sanitizedConfig),
        sanitizedConfig,
      );
      seedFrogbotCache(frogbot, sanitizedConfig);
    },
    buildSecretEndpoints({ connections, pieces: pieces.pieces }),
    attachFrogbot,
  );
  const payloadSanitizedPromise = payloadBuildConfig(payloadConfig).then(
    rewriteComponentPaths,
  );

  const sanitizedConfig: FrogbotSanitizedConfig = {
    admin: {
      importMap: {
        autoGenerate: config.admin?.importMap?.autoGenerate !== false,
      },
    },
    collections: collectionsMeta,
    secret: config.secret,
    port: (config as any).port, // eslint-disable-line @typescript-eslint/no-explicit-any
    onInit: (config as any).onInit, // eslint-disable-line @typescript-eslint/no-explicit-any
    ai: sanitizedAI && { ...sanitizedAI, usage: { slug: usageSlug } },
    agents,
    chat,
    connections,
    files,
    pieces,
    typescript: {
      autoGenerate:
        (config as { typescript?: { autoGenerate?: boolean } }).typescript
          ?.autoGenerate !== false,
    },
    _internal: {
      payloadConfig: payloadSanitizedPromise,
      noEmail: !config.email,
    },
  };
  sanitizedConfigRef.current = sanitizedConfig;
  return sanitizedConfig;
}
