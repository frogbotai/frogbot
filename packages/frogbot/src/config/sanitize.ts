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

import { buildConfig as payloadBuildConfig } from 'payload';
import type {
  CollectionConfig as PayloadCollectionConfig,
  Config as PayloadConfig,
  Endpoint as PayloadEndpoint,
  PayloadEmailAdapter,
  PayloadHandler,
  PayloadRequest,
} from 'payload';

import type { CollectionConfig } from '../types/collection.js';
import { CHAT_ROLE_MARKERS } from '../types/collection.js';
import type { FrogbotConfig } from '../types/config.js';
import type { Endpoint } from '../types/endpoint.js';
import type { FrogbotSanitizedConfig, SanitizedCollectionMeta } from '../types/sanitized.js';
import type { AIConfig, RouterConfig, SanitizedAIConfig } from '../types/ai.js';
import type { AgentConfig } from '../types/agent.js';
import type { FrogbotRequest } from '../types/request.js';
import type { Frogbot } from '../frogbot.js';
import { initFrogbotFromPayload } from '../frogbot.js';
import { buildAgentEndpoints } from '../agents/endpoints.js';
import { getGatewayProviderName } from '../ai/providerNames.js';
import { resolveChatCollections } from '../chat/resolveChatCollections.js';
import { seedFrogbotCache } from '../getFrogbot.js';
import { getFrogbotInstance } from '../instanceRegistry.js';
import { rewriteComponentPaths } from './rewriteComponentPaths.js';

const noopEmailAdapter: PayloadEmailAdapter<void> = ({ payload }) => ({
  name: 'frogbot-noop',
  defaultFromAddress: 'noop@frogbot.local',
  defaultFromName: 'FrogBot',
  sendEmail(message) {
    payload.logger.warn(
      `[frogbot] Email attempted without a configured adapter. To: '${String(message.to)}', Subject: '${String(message.subject)}'. ` +  
        `Configure an email adapter to send real emails.`,
    );
    return Promise.resolve();
  },
});

function attachFrogbot(req: PayloadRequest): FrogbotRequest {
  const frogbot = getFrogbotInstance(req.payload);
  if (!frogbot) throw new Error('[frogbot] Request created before Frogbot lifecycle initialization.');
  (req as PayloadRequest & { frogbot: Frogbot }).frogbot = frogbot;
  return req as unknown as FrogbotRequest;
}

function bootstrapBeforeOperation(args: { req: PayloadRequest }): void {
  attachFrogbot(args.req);
}

function wrapEndpointHandler(handler: PayloadHandler): PayloadHandler {
  return (req) => {
    attachFrogbot(req);
    return handler(req);
  };
}

function wrapRootHooks(hooks: FrogbotConfig['hooks']): PayloadConfig['hooks'] {
  if (!hooks?.afterError) return hooks as PayloadConfig['hooks'];
  return {
    afterError: hooks.afterError.map((hook) => (args) => hook({ ...args, req: attachFrogbot(args.req) })),
  };
}

function wrapEndpoints(endpoints: Endpoint[] | false | undefined): PayloadEndpoint[] | false | undefined {
  if (!endpoints) return endpoints;
  return endpoints.map((e) => ({
    ...e,
    handler: wrapEndpointHandler(e.handler as unknown as PayloadHandler),
  }));
}

function sanitizeCollection(c: CollectionConfig): PayloadCollectionConfig {
  const out: Record<string, unknown> = {
    ...(c as unknown as Record<string, unknown>),
  };

  // Strip chat role markers — FrogBot-only keys.
  for (const marker of CHAT_ROLE_MARKERS) {
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
  const existingBeforeOp = (existingHooks.beforeOperation as unknown[] | undefined) ?? [];
  out.hooks = {
    ...existingHooks,
    beforeOperation: [bootstrapBeforeOperation, ...existingBeforeOp],
  };

  // Wrap per-collection custom endpoints.
  if (c.endpoints !== undefined) {
    out.endpoints = wrapEndpoints(c.endpoints);
  }

  return out as unknown as PayloadCollectionConfig;
}

// ─── AI Config Sanitization ──────────────────────────────────────────────────

const defaultAccessFn = ({ req }: { req: FrogbotRequest }) => !!req.user;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeAI(ai: AIConfig): SanitizedAIConfig {
  // Validate providers.
  if (!isRecord(ai.providers)) {
    throw new Error('[frogbot] `ai.providers` is required and must be an object.');
  }
  const configured = Object.values(ai.providers).filter((entry) => entry != null);
  if (configured.length === 0) {
    throw new Error('[frogbot] At least one AI provider must be configured under `ai.providers`.');
  }
  for (const [key, entry] of Object.entries(ai.providers)) {
    if (!entry) {
      continue;
    }
    if (!key.trim()) {
      throw new Error('[frogbot] AI provider names must not be empty.');
    }
    if (!isRecord(entry)) {
      throw new Error(`[frogbot] Provider '${key}' must be an object.`);
    }
    const provider: Record<string, unknown> = entry;
    if ('type' in provider || 'baseUrl' in provider || 'models' in provider) {
      const custom = provider;
      if (custom.type !== 'openai-compatible') {
        throw new Error(`[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`);
      }
      if (typeof custom.baseUrl !== 'string' || !custom.baseUrl.trim()) {
        throw new Error(`[frogbot] Custom provider '${key}' requires a baseUrl.`);
      }
      if (!custom.models || !Array.isArray(custom.models) || custom.models.length === 0) {
        throw new Error(`[frogbot] Custom provider '${key}' requires a non-empty models array.`);
      }
      for (const model of custom.models) {
        if (!isRecord(model) || typeof model.id !== 'string' || !model.id.trim() || !model.mode) {
          throw new Error(`[frogbot] Every model for custom provider '${key}' requires an id and mode.`);
        }
      }
    }
  }

  // Validate routers.
  if (ai.routers !== undefined && !isRecord(ai.routers)) {
    throw new Error('[frogbot] `ai.routers` must be an object.');
  }
  const routers: Record<string, RouterConfig> = ai.routers ?? {};
  if (ai.defaultRouter && !routers[ai.defaultRouter]) {
    throw new Error(`[frogbot] defaultRouter '${ai.defaultRouter}' does not exist in ai.routers.`);
  }

  for (const [slug, router] of Object.entries(routers)) {
    if (!isRecord(router) || typeof router.model !== 'string' || !router.model.trim()) {
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
    deploymentId: ai.deploymentId ?? process.env.FROGBOT_DEPLOYMENT_ID ?? 'local',
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

function sanitizeAgents(agents: AgentConfig[], ai: SanitizedAIConfig | undefined): AgentConfig[] | undefined {
  if (!Array.isArray(agents)) {
    throw new Error('[frogbot] `agents` must be an array.');
  }
  if (agents.length === 0) {
    return undefined;
  }
  if (!ai) {
    throw new Error('[frogbot] `agents` requires an `ai` configuration block.');
  }

  const providers = new Set(
    Object.entries(ai.providers)
      .filter(([, entry]) => entry != null)
      .map(([provider]) => getGatewayProviderName(provider)),
  );
  const slugs = new Set<string>();

  return agents.map((agent) => {
    if (!isRecord(agent) || typeof agent.slug !== 'string' || !agent.slug.trim()) {
      throw new Error('[frogbot] Every agent must have a `slug`.');
    }
    if (agent.slug !== agent.slug.trim() || encodeURIComponent(agent.slug) !== agent.slug) {
      throw new Error(`[frogbot] Agent slug '${agent.slug}' is not URL-safe.`);
    }
    if (slugs.has(agent.slug)) {
      throw new Error(`[frogbot] Duplicate agent slug: '${agent.slug}'.`);
    }
    slugs.add(agent.slug);

    if (typeof agent.model !== 'string' || !agent.model.trim()) {
      throw new Error(`[frogbot] Agent '${agent.slug}' requires a \`model\`.`);
    }
    if (typeof agent.instructions !== 'string' || !agent.instructions.trim()) {
      throw new Error(`[frogbot] Agent '${agent.slug}' requires \`instructions\`.`);
    }
    if (agent.access !== undefined && typeof agent.access !== 'function') {
      throw new Error(`[frogbot] Agent '${agent.slug}' access must be a function.`);
    }
    if (
      agent.stopWhen !== undefined &&
      typeof agent.stopWhen !== 'function' &&
      (!Array.isArray(agent.stopWhen) ||
        agent.stopWhen.length === 0 ||
        agent.stopWhen.some((condition) => typeof condition !== 'function'))
    ) {
      throw new Error(`[frogbot] Agent '${agent.slug}' stopWhen must contain at least one condition.`);
    }

    const model = ai.routers[agent.model]?.model ?? agent.model;
    const separator = model.indexOf('/');
    const provider = separator > 0 ? model.slice(0, separator) : '';
    if (!provider || !providers.has(provider)) {
      throw new Error(
        `[frogbot] Agent '${agent.slug}' model '${agent.model}' does not resolve to a configured provider.`,
      );
    }

    if (agent.tools !== undefined) {
      if (!Array.isArray(agent.tools) || agent.tools.length === 0) {
        throw new Error(`[frogbot] Agent '${agent.slug}' tools must be a non-empty array when configured.`);
      }
      const toolSlugs = new Set<string>();
      for (const tool of agent.tools) {
        if (!isRecord(tool) || typeof tool.slug !== 'string' || !tool.slug.trim()) {
          throw new Error(`[frogbot] A tool in agent '${agent.slug}' is missing a \`slug\`.`);
        }
        if (toolSlugs.has(tool.slug)) {
          throw new Error(`[frogbot] Duplicate tool slug '${tool.slug}' in agent '${agent.slug}'.`);
        }
        if (typeof tool.description !== 'string' || !tool.description.trim()) {
          throw new Error(`[frogbot] Tool '${tool.slug}' in agent '${agent.slug}' requires a description.`);
        }
        if (!tool.inputSchema || typeof tool.execute !== 'function') {
          throw new Error(`[frogbot] Tool '${tool.slug}' in agent '${agent.slug}' requires inputSchema and execute.`);
        }
        toolSlugs.add(tool.slug);
      }
    }

    return { ...agent, access: agent.access ?? defaultAccessFn };
  });
}

function validateAgentPathReservations(config: Pick<FrogbotConfig, 'collections' | 'endpoints'>): void {
  if (config.collections.some((collection) => collection.slug === 'agents')) {
    throw new Error("[frogbot] Collection slug 'agents' is reserved for the agent API.");
  }

  const endpoints = (config as { endpoints?: Endpoint[] | false }).endpoints;
  if (endpoints !== undefined && endpoints !== false && !Array.isArray(endpoints)) {
    throw new Error('[frogbot] `endpoints` must be an array or false.');
  }

  for (const endpoint of Array.isArray(endpoints) ? endpoints : []) {
    if (endpoint.path === '/agents' || endpoint.path.startsWith('/agents/')) {
      throw new Error(`[frogbot] Endpoint path '${endpoint.path}' is reserved for the agent API.`);
    }
  }
}

// ─── Payload Config Building ─────────────────────────────────────────────────

function buildPayloadConfig(config: FrogbotConfig, onInit: NonNullable<PayloadConfig['onInit']>): PayloadConfig {
  const out: Record<string, unknown> = {
    ...(config as unknown as Record<string, unknown>),
    collections: config.collections.map(sanitizeCollection),
    hooks: wrapRootHooks(config.hooks),
  };

  const userEndpoints = config.endpoints as Endpoint[] | false | undefined;
  const agentEndpoints = config.agents?.length ? buildAgentEndpoints() : [];
  const allEndpoints = [...(Array.isArray(userEndpoints) ? userEndpoints : []), ...agentEndpoints];

  if (allEndpoints.length > 0) {
    out.endpoints = wrapEndpoints(allEndpoints);
  } else if (userEndpoints === false) {
    out.endpoints = false;
  } else if (userEndpoints !== undefined) {
    out.endpoints = wrapEndpoints(userEndpoints);
  }

  // Inject noop email adapter if none provided.
  if (!config.email) {
    out.email = noopEmailAdapter;
    console.warn(
       
      '[frogbot] No email adapter provided. Emails will be logged but not sent. ' +
        'Pass an `email` adapter to enable delivery.',
    );
  }

  out.typescript = {
    ...(config as { typescript?: Record<string, unknown> }).typescript,
    autoGenerate: false,
  };

  const admin = (
    config as {
      admin?: {
        components?: { graphics?: Record<string, unknown> } & Record<string, unknown>;
        importMap?: Record<string, unknown>;
        meta?: { openGraph?: Record<string, unknown> } & Record<string, unknown>;
      } & Record<string, unknown>;
    }
  ).admin;
  out.admin = {
    ...admin,
    components: {
      ...admin?.components,
      graphics: {
        Icon: '@frogbotai/next/rsc#FrogbotIcon',
        Logo: '@frogbotai/next/rsc#FrogbotLogo',
        ...admin?.components?.graphics,
      },
    },
    meta: {
      defaultOGImageType: 'static',
      titleSuffix: '- FrogBot',
      ...admin?.meta,
      openGraph: {
        description:
          'FrogBot is an open-source AI agent framework you configure in one TypeScript file, then deploy anywhere or run as a Docker image.',
        siteName: 'FrogBot',
        ...admin?.meta?.openGraph,
      },
    },
    importMap: {
      ...admin?.importMap,
      autoGenerate: false,
    },
  };

  const i18n = (config as { i18n?: { translations?: Record<string, unknown> } & Record<string, unknown> }).i18n;
  const en = i18n?.translations?.en as ({ general?: Record<string, unknown> } & Record<string, unknown>) | undefined;
  out.i18n = {
    ...i18n,
    translations: {
      ...i18n?.translations,
      en: {
        ...en,
        general: {
          payloadSettings: 'FrogBot Settings',
          ...en?.general,
        },
      },
    },
  };

  // Drop FrogBot-only keys before handing to Payload.
  delete out.plugins;
  delete out.onInit;
  delete out.port;
  delete out.ai;
  delete out.agents;
  out.onInit = onInit;

  return out as unknown as PayloadConfig;
}

export function sanitize(config: FrogbotConfig): FrogbotSanitizedConfig {
  if ((config as unknown as Record<string, unknown>).globals !== undefined) {
    throw new Error('[frogbot] `globals` is not a FrogBot concept. Use collections instead.');
  }
  validateAgentPathReservations(config);

  // Sanitize AI config if present.
  const sanitizedAI = config.ai ? sanitizeAI(config.ai) : undefined;
  const agents = config.agents !== undefined ? sanitizeAgents(config.agents, sanitizedAI) : undefined;

  // Resolve chat persistence — adopt marked collections or inject defaults.
  const { collections, chat } = resolveChatCollections({ ...config, agents });

  // Build collection metadata for FrogBot's sanitized config.
  const collectionsMeta: SanitizedCollectionMeta[] = collections.map((c) => ({
    slug: c.slug,
    auth: c.auth !== undefined && c.auth !== false,
  }));

  // Build the Payload config and pass it through Payload's buildConfig.
  const sanitizedConfigRef: { current?: FrogbotSanitizedConfig } = {};
  const payloadConfig = buildPayloadConfig({ ...config, agents, collections }, async (payload) => {
    const registered = getFrogbotInstance(payload);
    const sanitizedConfig = sanitizedConfigRef.current;
    if (!sanitizedConfig) throw new Error('[frogbot] Payload initialized before config sanitization completed.');
    const frogbot = registered ?? (await initFrogbotFromPayload(payload, sanitizedConfig));
    seedFrogbotCache(frogbot);
  });
  const payloadSanitizedPromise = payloadBuildConfig(payloadConfig).then(rewriteComponentPaths);

  const sanitizedConfig: FrogbotSanitizedConfig = {
    collections: collectionsMeta,
    secret: config.secret,
    port: (config as any).port, // eslint-disable-line @typescript-eslint/no-explicit-any
    onInit: (config as any).onInit, // eslint-disable-line @typescript-eslint/no-explicit-any
    ai: sanitizedAI,
    agents,
    chat,
    typescript: {
      autoGenerate: (config as { typescript?: { autoGenerate?: boolean } }).typescript?.autoGenerate !== false,
    },
    _internal: {
      payloadConfig: payloadSanitizedPromise,
    },
  };
  sanitizedConfigRef.current = sanitizedConfig;
  return sanitizedConfig;
}
