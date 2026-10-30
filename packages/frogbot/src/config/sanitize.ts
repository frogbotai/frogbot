import { buildConfig as payloadBuildConfig, MissingEditorProp } from 'payload';

import { sanitizeSettings, validateAppIcon } from '../admin/config/sanitize.js';
import { validateAdminIcon } from '../admin/icons.js';
import { sanitizeAgents } from '../agents/config/sanitize.js';
import { AGENT_SCHEDULE_TASK_SLUG, resolveScheduleTasks } from '../agents/resolveScheduleTasks.js';
import { sanitizeAI } from '../ai/config/sanitize.js';
import { resolveUsageCollection } from '../ai/usage/collection.js';
import { coordinateAuthEndpoints } from '../auth/endpoints.js';
import { unwrapSessionPayload } from '../auth/operation.js';
import { validateSignIn, validateSignInFields } from '../auth/signIn/validate.js';
import { buildChannelGatewayEndpoints } from '../channels/endpoints.js';
import {
  CHANNEL_QUESTION_UPDATE_TASK_SLUG,
  CHANNEL_TASK_SLUG,
} from '../channels/queueChannelTask.js';
import { resolveChannelTask } from '../channels/task.js';
import { buildChatEndpoints } from '../chat/endpoints.js';
import { resolveChatCollections } from '../chat/resolveChatCollections.js';
import { resolveUserSlug } from '../chat/resolveUserSlug.js';
import { wrapCollectionAccess } from '../collections/config/sanitize.js';
import { resolveConnectionsCollections } from '../connections/resolveCollections.js';
import { buildSecretEndpoints } from '../connections/secret.js';
import type { Endpoint } from '../endpoints/types.js';
import { sanitizeAIFields } from '../fields/baseFields/ai/sanitize.js';
import { resolveAIFieldTask } from '../fields/baseFields/ai/task.js';
import { AUTONUMBERS_SLUG } from '../fields/baseFields/autonumber/collection.js';
import { assertRichTextEditor } from '../fields/config/assertRichTextEditor.js';
import { initFrogBotFromPayload } from '../frogbot.js';
import { seedFrogBotCache } from '../getFrogBot.js';
import { ensureFrogBotInstance, getFrogBotInstance } from '../instanceRegistry.js';
import { resolveJobsConfig } from '../jobs/config.js';
import { withJobsRuntime } from '../jobs/runtime.js';
import { defaultWaitpointsCollection, WAITPOINTS_SLUG } from '../jobs/waitpoints/collection.js';
import { databaseKVAdapter } from '../kv/adapters/DatabaseKVAdapter.js';
import { resolveKVCleanupTask } from '../kv/resolveCleanupTask.js';
import { sanitizeMCPServers } from '../mcp/server.js';
import { collectPieceInstances } from '../pieces/config/sanitize.js';
import { buildSearchManyEndpoint } from '../search/endpoints.js';
import { withSearchRuntime } from '../search/runtime.js';
import { sanitizeSearchIndexes } from '../search/sanitize.js';
import { sanitizeToolList } from '../tools/config/sanitize.js';
import {
  defaultTriggerSubscriptionsCollection,
  TRIGGER_SUBSCRIPTIONS_SLUG,
} from '../triggers/collection.js';
import { buildTriggerEndpoints } from '../triggers/endpoints.js';
import { buildIngressRegistry, requiresAdapterVerification } from '../triggers/registry.js';
import { AGENT_TRIGGER_TASK_SLUG, resolveTriggerTasks } from '../triggers/task.js';
import { resolveFilesCollection } from '../uploads/resolveCollections.js';
import { resolveStorageAdapters } from '../uploads/storage.js';
import { attachFrogBotInstance } from './attachFrogBot.js';
import { buildPayloadConfig } from './buildPayloadConfig.js';
import { hideBuiltInGraphQL } from './hideBuiltInGraphQL.js';
import { rewriteComponentPaths } from './rewriteComponentPaths.js';
import type {
  AutonumberEntry,
  FrogBotSanitizedConfig,
  SanitizedCollectionMeta,
} from './sanitized.js';
import type { FrogBotConfig, OnInit } from './types.js';
import type { ValidationMode } from './validationContext.js';
import { getValidationMode } from './validationContext.js';
import type { AttachFrogBot, ResolveFrogBot } from './wrapRequest.js';

function validateInternalPathReservations(
  config: Pick<FrogBotConfig, 'collections' | 'endpoints'>,
): void {
  for (const [slug, api] of [
    ['agents', 'agent'],
    ['connections', 'connections'],
    ['frogbot', 'FrogBot'],
    ['jobs', 'jobs'],
    [TRIGGER_SUBSCRIPTIONS_SLUG, 'trigger subscriptions'],
    ['v1', 'AI gateway'],
    ['webhooks', 'webhook'],
  ] as const) {
    if (config.collections.some((collection) => collection.slug === slug)) {
      throw new Error(`[frogbot] Collection slug '${slug}' is reserved for the ${api} API.`);
    }
  }

  const endpoints = (config as { endpoints?: Endpoint[] | false }).endpoints;
  if (endpoints !== undefined && endpoints !== false && !Array.isArray(endpoints)) {
    throw new Error('[frogbot] `endpoints` must be an array or false.');
  }

  for (const endpoint of Array.isArray(endpoints) ? endpoints : []) {
    for (const prefix of ['connections', 'jobs', 'webhooks']) {
      if (endpoint.path === `/${prefix}` || endpoint.path.startsWith(`/${prefix}/`)) {
        throw new Error(
          `[frogbot] Endpoint path '${endpoint.path}' is reserved for the ${prefix} API.`,
        );
      }
    }

    if (endpoint.path === '/agents' || endpoint.path.startsWith('/agents/')) {
      throw new Error(`[frogbot] Endpoint path '${endpoint.path}' is reserved for the agent API.`);
    }

    if (endpoint.path === '/frogbot' || endpoint.path.startsWith('/frogbot/')) {
      throw new Error(
        `[frogbot] Endpoint path '${endpoint.path}' is reserved for the FrogBot API.`,
      );
    }

    if (endpoint.path === '/v1' || endpoint.path.startsWith('/v1/')) {
      throw new Error(
        `[frogbot] Endpoint path '${endpoint.path}' is reserved for the AI gateway API.`,
      );
    }
  }
}

function validateCLICommands(commands: Record<string, unknown> | undefined): void {
  for (const [name, command] of Object.entries(commands ?? {})) {
    if (name !== name.toLowerCase()) {
      throw new Error(`[frogbot] cli command "${name}" must be lowercase`);
    }

    if (typeof command !== 'function') {
      throw new Error(`[frogbot] cli command "${name}" must be a function`);
    }
  }
}

function normalizeOnInit(onInit: OnInit | OnInit[] | undefined): OnInit | undefined {
  if (!Array.isArray(onInit)) return onInit;
  if (onInit.length === 0) return undefined;

  return async (frogbot) => {
    for (const callback of onInit) await callback(frogbot);
  };
}

export function sanitize(
  config: FrogBotConfig,
  { mode = getValidationMode() }: { mode?: ValidationMode } = {},
): FrogBotSanitizedConfig {
  assertRichTextEditor(config);

  if ('globals' in config && config.globals !== undefined) {
    throw new Error('[frogbot] `globals` is not a FrogBot concept. Use collections instead.');
  }

  if (config.admin?.livePreview && 'globals' in config.admin.livePreview) {
    throw new Error(
      '[frogbot] `admin.livePreview.globals` is not a FrogBot concept. Use `collections` instead.',
    );
  }

  for (const collection of config.collections) {
    validateSignIn(collection);
    validateAdminIcon(collection.admin?.icon);
  }

  for (const item of config.admin?.components?.navItems ?? []) {
    validateAdminIcon(item.icon);
  }

  validateAppIcon(config.admin?.meta?.appIcon);

  validateInternalPathReservations(config);
  validateCLICommands(config.cli?.commands);
  const settings = sanitizeSettings(config.settings);
  const sanitizedConfigRef: { current?: FrogBotSanitizedConfig } = {};

  const resolveFrogBot: ResolveFrogBot = async (payload) => {
    const registered = getFrogBotInstance(payload);

    if (registered) return registered;

    const sanitizedConfig = sanitizedConfigRef.current;

    if (!sanitizedConfig) {
      throw new Error('[frogbot] Payload initialized before config sanitization completed.');
    }

    return ensureFrogBotInstance(payload, () => initFrogBotFromPayload(payload, sanitizedConfig));
  };

  const attachFrogBot: AttachFrogBot = async (req) => {
    req.payload = unwrapSessionPayload(req.payload);

    const sanitizedConfig = sanitizedConfigRef.current;

    if (!sanitizedConfig) {
      throw new Error('[frogbot] Payload initialized before config sanitization completed.');
    }

    const frogbot = await ensureFrogBotInstance(
      req.payload,
      () => initFrogBotFromPayload(req.payload, sanitizedConfig),
      sanitizedConfig,
    );

    seedFrogBotCache(frogbot, sanitizedConfig);

    return attachFrogBotInstance(req, frogbot);
  };

  const sanitizedAI = config.ai ? sanitizeAI(config.ai, mode) : undefined;

  sanitizeAIFields({
    ai: config.ai,
    blocks: config.blocks,
    collections: config.collections,
    mode,
  });

  if (config.tools !== undefined && !Array.isArray(config.tools)) {
    throw new Error('[frogbot] Root tools must be an array when configured.');
  }

  const rootTools = sanitizeToolList(config.tools ?? [], 'Root');
  const rootMCP = sanitizeMCPServers(config.tools ?? [], 'Root');
  const agents =
    config.agents !== undefined
      ? sanitizeAgents({ agents: config.agents, ai: sanitizedAI, mode, rootTools, rootMCP })
      : undefined;

  const triggers = buildIngressRegistry({ agents });
  const hasChannelAdapters = Object.values(triggers).some(
    (entry) => entry.channelAgentSlug || requiresAdapterVerification(entry),
  );

  const hasScheduleTriggers = agents?.some((agent) =>
    agent.triggers?.some((trigger) => 'type' in trigger && trigger.type === 'schedule'),
  );

  if (
    hasScheduleTriggers &&
    config.jobs?.tasks?.some((task) => task.slug === AGENT_SCHEDULE_TASK_SLUG)
  ) {
    throw new Error(
      `[frogbot] Job task slug '${AGENT_SCHEDULE_TASK_SLUG}' is reserved for agent schedule triggers.`,
    );
  }

  if (
    Object.keys(triggers).length &&
    config.jobs?.tasks?.some((task) => task.slug === AGENT_TRIGGER_TASK_SLUG)
  ) {
    throw new Error(
      `[frogbot] Job task slug '${AGENT_TRIGGER_TASK_SLUG}' is reserved for agent triggers.`,
    );
  }

  const reservedChannelTask = agents?.some((agent) => agent.channels?.length)
    ? config.jobs?.tasks?.find(
        (task) =>
          task.slug === CHANNEL_TASK_SLUG || task.slug === CHANNEL_QUESTION_UPDATE_TASK_SLUG,
      )
    : undefined;

  if (reservedChannelTask) {
    throw new Error(
      `[frogbot] Job task slug '${reservedChannelTask.slug}' is reserved for channels.`,
    );
  }

  const kv = config.kv ?? databaseKVAdapter();
  const resolvedJobs = resolveJobsConfig(config.jobs);
  const channelJobs = agents?.some((agent) => agent.channels?.length)
    ? resolveChannelTask(resolvedJobs)
    : resolvedJobs;

  const jobs = resolveAIFieldTask({
    collections: config.collections,
    jobs: {
      ...resolvedJobs,
      ...resolveKVCleanupTask({
        kv,
        jobs: Object.keys(triggers).length
          ? resolveTriggerTasks(resolveScheduleTasks({ agents, jobs: channelJobs }))
          : resolveScheduleTasks({ agents, jobs: channelJobs }),
      }),
    },
  });

  if (config.collections.some(({ slug }) => slug === WAITPOINTS_SLUG)) {
    throw new Error(`FrogBot collection '${WAITPOINTS_SLUG}' is reserved for durable waits.`);
  }

  if (config.collections.some(({ slug }) => slug === AUTONUMBERS_SLUG)) {
    throw new Error(
      `FrogBot collection '${AUTONUMBERS_SLUG}' is reserved for autonumber counters.`,
    );
  }

  const chatResult = resolveChatCollections({ ...config, agents });
  const { collections: usageCollections, slug: usageSlug } = resolveUsageCollection(
    { ...config, agents, collections: chatResult.collections },
    chatResult.chat.enabled ? chatResult.chat.chatsSlug : undefined,
  );

  const connectionsResult = resolveConnectionsCollections({
    ...config,
    agents,
    collections: usageCollections,
  });

  const pieces = collectPieceInstances({
    config,
    agents,
    rootTools,
    triggers,
    connections: connectionsResult.connections,
  });

  const { collections: resolvedCollections, files } = resolveFilesCollection({
    collections: [
      ...connectionsResult.collections,
      ...(Object.keys(triggers).length ? [defaultTriggerSubscriptionsCollection()] : []),
      defaultWaitpointsCollection(),
    ],
  });

  config = { ...config, collections: resolvedCollections, onInit: normalizeOnInit(config.onInit) };

  const storage = resolveStorageAdapters({
    adapters: config.storage ?? [],
    builtInSlugs: [
      ...(files ? [files.slug] : []),
      ...(chatResult.chat.enabled ? [chatResult.chat.assetsSlug] : []),
    ],
  });

  const collections = config.collections;

  const connections = connectionsResult.connections;
  if (connections.enabled) {
    if (settings.some(({ path }) => path === 'connections' || path.startsWith('connections/'))) {
      throw new Error("[frogbot] Settings path 'connections' is reserved for linked accounts.");
    }

    settings.push({
      path: 'connections',
      label: 'Linked accounts',
      Component: '@frogbotai/ui/admin/rsc#ConnectionsView',
    });
  }

  const connectionCollection = collections.find(({ slug }) => slug === connections.slug);
  if (connectionCollection) {
    connectionCollection.endpoints = [
      ...(connectionCollection.endpoints || []),
      ...buildSecretEndpoints({
        connections,
        userSlug: resolveUserSlug(config),
      }),
    ];
  }

  const chat = chatResult.chat;
  const payloadCollections = chat.enabled
    ? collections.map((collection) =>
        collection.slug === chat.chatsSlug ? { ...collection, chat: true as const } : collection,
      )
    : collections;

  const localizeStatus = Boolean(config.localization);

  const collectionsMeta: SanitizedCollectionMeta[] = collections.map((c) => {
    const search = sanitizeSearchIndexes(c, { localizeStatus });

    return {
      slug: c.slug,
      auth: c.auth !== undefined && c.auth !== false,
      ...(search ? { search } : {}),
    };
  });

  const searchCollections = collectionsMeta.flatMap(({ slug, search }) =>
    search ? [{ slug, search }] : [],
  );

  const autonumbers: AutonumberEntry[] = [];

  const payloadConfig = buildPayloadConfig({
    config: { ...config, agents, collections: payloadCollections, jobs, kv, settings },
    onInit: async (payload) => {
      const sanitizedConfig = sanitizedConfigRef.current;
      if (!sanitizedConfig) {
        throw new Error('[frogbot] Payload initialized before config sanitization completed.');
      }

      const frogbot = await ensureFrogBotInstance(
        payload,
        () => initFrogBotFromPayload(payload, sanitizedConfig),
        sanitizedConfig,
      );

      seedFrogBotCache(frogbot, sanitizedConfig);
    },
    internalEndpoints: [
      ...(chat.enabled ? buildChatEndpoints() : []),
      ...(Object.keys(triggers).length ? buildTriggerEndpoints() : []),
      ...(hasChannelAdapters ? buildChannelGatewayEndpoints() : []),
      ...(searchCollections.length ? [buildSearchManyEndpoint()] : []),
    ],
    attachFrogBot,
    resolveFrogBot,
    searchCollections,
    autonumbers,
    storage,
  });

  payloadConfig.db = withSearchRuntime({
    adapter: withJobsRuntime({ adapter: payloadConfig.db }),
    collections: searchCollections,
    search: config.db.search,
  });

  const payloadSanitizedPromise = payloadBuildConfig(payloadConfig)
    .then((built) => {
      for (const collection of built.collections) {
        if (collection.custom?.frogbot?.signIn?.length) validateSignInFields(collection);
        wrapCollectionAccess(collection, attachFrogBot);
        coordinateAuthEndpoints({ collection, attachFrogBot });
      }

      hideBuiltInGraphQL(built);

      return rewriteComponentPaths(built);
    })
    .catch((error: unknown) => {
      if (error instanceof MissingEditorProp) {
        throw new Error(
          '[frogbot] A nested rich text field requires an explicit Lexical editor to avoid recursive defaults. Configure editor: lexicalEditor({}) on the nested field using @frogbotai/richtext-lexical.',
          { cause: error },
        );
      }

      throw error;
    });

  const sanitizedConfig: FrogBotSanitizedConfig = {
    admin: {
      importMap: {
        autoGenerate: config.admin?.importMap?.autoGenerate !== false,
      },
    },
    collections: collectionsMeta,
    secret: config.secret,
    port: (config as any).port, // eslint-disable-line @typescript-eslint/no-explicit-any -- port is not on the Payload config type
    onInit: normalizeOnInit(config.onInit),
    ai: sanitizedAI && { ...sanitizedAI, usage: { slug: usageSlug } },
    agents,
    chat,
    cli: { commands: config.cli?.commands ?? {} },
    connections,
    files,
    pieces,
    settings,
    typescript: {
      autoGenerate:
        (config as { typescript?: { autoGenerate?: boolean } }).typescript?.autoGenerate !== false,
    },
    _internal: {
      payloadConfig: payloadSanitizedPromise,
      noEmail: !config.email,
      triggers,
      autonumbers,
    },
  };

  sanitizedConfigRef.current = sanitizedConfig;

  return sanitizedConfig;
}
