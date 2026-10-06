// Sanitize a FrogBot config into two outputs:
//   1. A `FrogBotSanitizedConfig` — FrogBot's own metadata preserved.
//   2. A Payload-shaped config stored in `_internal.payloadConfig`.
//
// Concerns:
//   1. Reject `globals` at runtime with a clear `[frogbot]` error.
//   2. Inject the `req.frogbot` bootstrap into every collection's
//      `beforeOperation` hooks.
//   3. Wrap every custom endpoint handler (root and per-collection) so
//      `req.frogbot` is attached before the user's handler executes.

import { Cron } from 'croner';
import type {
  AuthStrategy as PayloadAuthStrategy,
  AuthStrategyResult as PayloadAuthStrategyResult,
  CollectionConfig as PayloadCollectionConfig,
  Config as PayloadConfig,
  Endpoint as PayloadEndpoint,
  LivePreviewConfig as PayloadLivePreviewConfig,
  Payload,
  PayloadEmailAdapter,
  PayloadHandler,
  PayloadRequest,
  UploadConfig as PayloadUploadConfig,
} from 'payload';
import { buildConfig as payloadBuildConfig, MissingEditorProp } from 'payload';

import { validateAdminIcon } from '../admin/icons.js';
import type { RootAdminMetaConfig, SettingsEntry } from '../admin/types.js';
import type { CollectionView } from '../admin/views/types.js';
import { buildAgentEndpoints } from '../agents/endpoints.js';
import {
  AGENT_SCHEDULE_TASK_SLUG,
  everyToCron,
  resolveScheduleTasks,
} from '../agents/resolveScheduleTasks.js';
import type { AgentConfig, AgentModelId, SanitizedAgentConfig } from '../agents/types.js';
import { isKnownModelId } from '../ai/catalog.js';
import {
  getConfiguredChatModelIds,
  getConfiguredModelIds,
  getConfiguredTranscriptionModelIds,
} from '../ai/models.js';
import { createPolicyHooks } from '../ai/policy.js';
import { createPolicyFields, mergePolicyFields } from '../ai/policyFields.js';
import { isProviderName } from '../ai/providerNames.js';
import type { AIConfig, RouterConfig, SanitizedAIConfig } from '../ai/types.js';
import { resolveUsageCollection } from '../ai/usage/collection.js';
import { coordinateAuthEndpoints } from '../auth/endpoints.js';
import { executeAuthStrategy } from '../auth/executeAuthStrategy.js';
import { unwrapSessionPayload } from '../auth/operation.js';
import { buildSignInEndpoints } from '../auth/signIn/endpoints.js';
import { validateSignIn, validateSignInFields } from '../auth/signIn/validate.js';
import type { AuthEmail, AuthStrategy } from '../auth/types.js';
import { buildChannelGatewayEndpoints } from '../channels/endpoints.js';
import {
  CHANNEL_QUESTION_UPDATE_TASK_SLUG,
  CHANNEL_TASK_SLUG,
} from '../channels/queueChannelTask.js';
import { resolveChannelTask } from '../channels/task.js';
import { buildChatEndpoints } from '../chat/endpoints.js';
import { buildManifestEndpoint } from '../chat/manifest.js';
import { resolveChatCollections } from '../chat/resolveChatCollections.js';
import { resolveUserSlug } from '../chat/resolveUserSlug.js';
import type { CollectionAdminConfig, CollectionConfig } from '../collections/config/types.js';
import { COLLECTION_MARKERS } from '../collections/config/types.js';
import { resolveConnectionsCollections } from '../connections/resolveCollections.js';
import { buildSecretEndpoints } from '../connections/secret.js';
import type { SanitizedConnectionsConfig } from '../connections/types.js';
import type { MapVectorField } from '../database/types.js';
import type { Endpoint } from '../endpoints/types.js';
import { sanitizeAIFields } from '../fields/baseFields/ai/sanitize.js';
import { resolveAIFieldTask } from '../fields/baseFields/ai/task.js';
import {
  AUTONUMBERS_SLUG,
  defaultAutonumbersCollection,
} from '../fields/baseFields/autonumber/collection.js';
import { assertRichTextEditor } from '../fields/config/assertRichTextEditor.js';
import type { SystemKindUsers } from '../fields/config/sanitizeSystemKinds.js';
import { sanitizeVectorFields } from '../fields/config/sanitizeVector.js';
import { wrapFieldRequestFunctions } from '../fields/config/wrapRequestFunctions.js';
import type { FrogBot } from '../frogbot.js';
import { initFrogBotFromPayload } from '../frogbot.js';
import { seedFrogBotCache } from '../getFrogBot.js';
import { ensureFrogBotInstance, getFrogBotInstance } from '../instanceRegistry.js';
import { resolveJobsConfig } from '../jobs/config.js';
import { buildResumeEndpoints } from '../jobs/endpoints/resume.js';
import { withJobsRuntime } from '../jobs/runtime.js';
import { defaultWaitpointsCollection, WAITPOINTS_SLUG } from '../jobs/waitpoints/collection.js';
import { databaseKVAdapter } from '../kv/adapters/DatabaseKVAdapter.js';
import { resolveKVCleanupTask } from '../kv/resolveCleanupTask.js';
import {
  isPieceAction,
  isPieceInstance,
  pieceActionTool,
  pieceInstanceDefinition,
  pieceInstanceRuntime,
  pieceInstanceTools,
  pieceToolInstance,
} from '../pieces/definePiece.js';
import { pieceEmailAdapter } from '../pieces/email.js';
import {
  type PieceAction,
  pieceCapabilities,
  type PieceInstance,
  type SanitizedPiecesConfig,
} from '../pieces/types.js';
import { buildSearchEndpoints, buildSearchManyEndpoint } from '../search/endpoints.js';
import { buildSearchQueries } from '../search/graphQL.js';
import { withSearchRuntime } from '../search/runtime.js';
import { sanitizeSearchIndexes } from '../search/sanitize.js';
import type { SearchCollection, SearchIndexDescriptors } from '../search/types.js';
import { buildSkillTools } from '../skills/tools.js';
import type { SkillConfig } from '../skills/types.js';
import type { AnyTool } from '../tools/types.js';
import { isClientTool } from '../tools/types.js';
import {
  defaultTriggerSubscriptionsCollection,
  TRIGGER_SUBSCRIPTIONS_SLUG,
} from '../triggers/collection.js';
import { buildTriggerEndpoints } from '../triggers/endpoints.js';
import { buildIngressRegistry, requiresAdapterVerification } from '../triggers/registry.js';
import { AGENT_TRIGGER_TASK_SLUG, resolveTriggerTasks } from '../triggers/task.js';
import type { IngressRegistry } from '../triggers/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { resolveFilesCollection } from '../uploads/resolveCollections.js';
import { applyStorageAdapters } from '../uploads/storage.js';
import type { UploadHandler } from '../uploads/types.js';
import { attachFrogBotInstance, attachRegisteredFrogBot } from './attachFrogBot.js';
import {
  buildBoardOrderField,
  buildBoardOrderHook,
  compileCollectionViews,
  getBoardOrderFieldNames,
} from './collectionViews.js';
import { hideBuiltInGraphQL } from './hideBuiltInGraphQL.js';
import { rewriteComponentPaths } from './rewriteComponentPaths.js';
import type {
  AutonumberEntry,
  FrogBotSanitizedConfig,
  SanitizedCollectionMeta,
} from './sanitized.js';
import { resolveSourceDir } from './sourceDir.js';
import type { FrogBotConfig, GeneratePreviewURL, LivePreviewConfig, OnInit } from './types.js';
import type { ValidationMode } from './validationContext.js';
import { getValidationMode } from './validationContext.js';
import { wrapGraphQLExtension } from './wrapGraphQLExtension.js';

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

type AttachFrogBot = (req: PayloadRequest) => Promise<FrogBotRequest>;

type ResolveFrogBot = (payload: Payload) => Promise<FrogBot>;

function wrapAuthStrategies({
  collection,
  strategies,
  resolveFrogBot,
}: {
  collection: string;
  strategies: AuthStrategy[];
  resolveFrogBot: ResolveFrogBot;
}): PayloadAuthStrategy[] {
  return strategies.map((strategy) => ({
    name: strategy.name,
    authenticate: async ({ payload, canSetHeaders, headers, isGraphQL, req, strategyName }) => {
      const frogbot = await resolveFrogBot(unwrapSessionPayload(payload));

      seedFrogBotCache(frogbot, frogbot.config);

      const frogbotReq = req ? attachFrogBotInstance(req, frogbot) : undefined;

      return executeAuthStrategy({
        collection,
        strategy,
        canSetHeaders,
        frogbot,
        headers,
        isGraphQL,
        req: frogbotReq,
        strategyName,
      }) as Promise<PayloadAuthStrategyResult>;
    },
  }));
}

async function bootstrapFrogBot(
  args: { req: PayloadRequest },
  attachFrogBot: AttachFrogBot,
): Promise<void> {
  if (!args.req.payload) return;

  await attachFrogBot(args.req);
}

function wrapEndpointHandler(
  handler: PayloadHandler,
  attachFrogBot: AttachFrogBot,
): PayloadHandler {
  return async (req) => {
    await attachFrogBot(req);
    return handler(req);
  };
}

function wrapRootHooks(
  hooks: FrogBotConfig['hooks'],
  attachFrogBot: AttachFrogBot,
): PayloadConfig['hooks'] {
  if (!hooks?.afterError) return hooks as PayloadConfig['hooks'];
  return {
    afterError: hooks.afterError.map((hook) => async (args) => {
      if (!args.req.payload) return hook(args as never);
      return hook({ ...args, req: await attachFrogBot(args.req) });
    }),
  };
}

function wrapLivePreview(
  livePreview: LivePreviewConfig | undefined,
  attachFrogBot: AttachFrogBot,
): PayloadLivePreviewConfig | undefined {
  if (!livePreview || typeof livePreview.url !== 'function') {
    return livePreview as PayloadLivePreviewConfig | undefined;
  }

  const { url } = livePreview;

  return {
    ...livePreview,
    url: async ({ collectionConfig, data, locale, req }) =>
      url({ collectionConfig, data, locale, req: await attachFrogBot(req) }),
  };
}

type PayloadPreview = NonNullable<NonNullable<PayloadCollectionConfig['admin']>['preview']>;

function wrapPreview(preview: GeneratePreviewURL, attachFrogBot: AttachFrogBot): PayloadPreview {
  return async (doc, options) =>
    preview(doc, { ...options, req: await attachFrogBot(options.req) });
}

type PayloadFormatDocURL = NonNullable<
  NonNullable<PayloadCollectionConfig['admin']>['formatDocURL']
>;

function wrapFormatDocURL(
  formatDocURL: NonNullable<CollectionAdminConfig['formatDocURL']>,
): PayloadFormatDocURL {
  return (args) => formatDocURL({ ...args, req: attachRegisteredFrogBot(args.req) });
}

type PayloadUploadHandler = NonNullable<PayloadUploadConfig['handlers']>[number];

function wrapUploadHandlers(
  handlers: UploadHandler[],
  attachFrogBot: AttachFrogBot,
): PayloadUploadHandler[] {
  return handlers.map(
    (handler) =>
      (async (req, args) => handler(await attachFrogBot(req), args)) as PayloadUploadHandler,
  );
}

type AuthEmailTemplate = NonNullable<AuthEmail['generateEmailHTML']>;

type PayloadAuthEmailTemplate = (args: {
  req: PayloadRequest;
  token: string;
  user: unknown;
}) => Promise<string>;

function wrapAuthEmailTemplate(
  template: AuthEmailTemplate,
  attachFrogBot: AttachFrogBot,
): PayloadAuthEmailTemplate {
  return async (args) => template({ ...args, req: await attachFrogBot(args.req) });
}

function wrapAuthEmail(email: AuthEmail, attachFrogBot: AttachFrogBot): Record<string, unknown> {
  const { generateEmailHTML, generateEmailSubject } = email;

  return {
    ...email,
    ...(generateEmailHTML
      ? { generateEmailHTML: wrapAuthEmailTemplate(generateEmailHTML, attachFrogBot) }
      : {}),
    ...(generateEmailSubject
      ? { generateEmailSubject: wrapAuthEmailTemplate(generateEmailSubject, attachFrogBot) }
      : {}),
  };
}

function wrapLocalization(
  localization: FrogBotConfig['localization'],
  attachFrogBot: AttachFrogBot,
): PayloadConfig['localization'] {
  if (!localization || typeof localization.filterAvailableLocales !== 'function') {
    return localization as PayloadConfig['localization'];
  }

  const { filterAvailableLocales } = localization;

  return {
    ...localization,
    filterAvailableLocales: async (args) =>
      filterAvailableLocales({ ...args, req: await attachFrogBot(args.req) }),
  };
}

function wrapEndpoints(
  endpoints: Endpoint[] | false | undefined,
  attachFrogBot: AttachFrogBot,
): PayloadEndpoint[] | false | undefined {
  if (!endpoints) return endpoints;
  return endpoints.map((e) => ({
    ...e,
    handler: wrapEndpointHandler(e.handler as unknown as PayloadHandler, attachFrogBot),
  }));
}

type PayloadCollectionAccess = NonNullable<PayloadCollectionConfig['access']>;

function wrapCollectionAccessFunction<
  TAccess extends NonNullable<PayloadCollectionAccess[keyof PayloadCollectionAccess]>,
>(access: TAccess, attachFrogBot: AttachFrogBot): TAccess {
  const wrapped = async (args: Parameters<TAccess>[0]) => {
    const accessArgs = args as { req?: PayloadRequest };

    if (!accessArgs.req?.payload) return access(args as never);

    await attachFrogBot(accessArgs.req);

    return access(args as never);
  };

  return wrapped as TAccess;
}

function assignWrappedCollectionAccess<TOperation extends keyof PayloadCollectionAccess>(
  accessConfig: PayloadCollectionAccess,
  operation: TOperation,
  access: NonNullable<PayloadCollectionAccess[TOperation]>,
  attachFrogBot: AttachFrogBot,
): void {
  accessConfig[operation] = wrapCollectionAccessFunction(access, attachFrogBot);
}

function wrapCollectionAccess(
  collection: PayloadCollectionConfig,
  attachFrogBot: AttachFrogBot,
): void {
  const accessConfig = collection.access;

  if (!accessConfig) return;

  const operations = Object.keys(accessConfig) as (keyof PayloadCollectionAccess)[];

  for (const operation of operations) {
    const access = accessConfig[operation];

    if (typeof access !== 'function') continue;

    assignWrappedCollectionAccess(accessConfig, operation, access, attachFrogBot);
  }
}

function sanitizeCollection(
  c: CollectionConfig,
  attachFrogBot: AttachFrogBot,
  {
    mapVectorField,
    onAutonumber,
    search,
    resolveFrogBot,
    users,
  }: {
    mapVectorField?: MapVectorField;
    onAutonumber?: (path: string) => void;
    search?: SearchIndexDescriptors;
    resolveFrogBot: ResolveFrogBot;
    users: SystemKindUsers;
  },
): PayloadCollectionConfig {
  const signIn = validateSignIn(c);
  let collectionViews: CollectionView[] = [];
  const admin = compileCollectionViews({
    collection: c,
    onRuntimeViews: (views) => {
      collectionViews = views;
    },
  }) as PayloadCollectionConfig['admin'];

  if (admin?.livePreview) {
    admin.livePreview = wrapLivePreview(c.admin?.livePreview, attachFrogBot);
  }

  if (admin && typeof c.admin?.preview === 'function') {
    admin.preview = wrapPreview(c.admin.preview, attachFrogBot);
  }

  if (admin && typeof c.admin?.formatDocURL === 'function') {
    admin.formatDocURL = wrapFormatDocURL(c.admin.formatDocURL);
  }

  const views = admin?.components?.views;
  const orderFieldNames = getBoardOrderFieldNames(c);
  const existingHooks = (c.hooks ?? {}) as Record<string, unknown[]>;
  const out: Record<string, unknown> = {
    ...(c as unknown as Record<string, unknown>),
    fields: wrapFieldRequestFunctions(
      sanitizeVectorFields({
        collection: c.slug,
        fields: [...c.fields, ...orderFieldNames.map(buildBoardOrderField)],
        mapVectorField,
        onAutonumber,
        users,
      }),
    ),
    ...(admin ? { admin } : {}),
    ...(typeof c.upload === 'object' && c.upload.handlers
      ? {
          upload: {
            ...c.upload,
            handlers: wrapUploadHandlers(c.upload.handlers, attachFrogBot),
          },
        }
      : {}),
    ...(orderFieldNames.length
      ? {
          orderable: true,
        }
      : {}),
    ...(c.chat === true
      ? {
          admin: {
            ...admin,
            components: {
              ...admin?.components,
              views: {
                ...views,
                edit: {
                  ...views?.edit,
                  root: views?.edit?.root ?? {
                    Component: '@frogbotai/next/views#ChatView',
                  },
                },
              },
            },
          },
        }
      : {}),
  };

  // Strip chat role markers — FrogBot-only keys.
  for (const marker of COLLECTION_MARKERS) {
    delete out[marker];
  }

  delete out.search;

  // Capture auth state into `custom.frogbot`.
  const auth = c.auth !== undefined && c.auth !== false;

  if (typeof c.auth === 'object') {
    const { signIn: _signIn, strategies, ...collectionAuth } = c.auth;

    out.auth = {
      ...collectionAuth,
      ...(typeof collectionAuth.verify === 'object'
        ? { verify: wrapAuthEmail(collectionAuth.verify, attachFrogBot) }
        : {}),
      ...(collectionAuth.forgotPassword
        ? { forgotPassword: wrapAuthEmail(collectionAuth.forgotPassword, attachFrogBot) }
        : {}),
      ...(strategies
        ? { strategies: wrapAuthStrategies({ collection: c.slug, strategies, resolveFrogBot }) }
        : {}),
    };
  }

  const existingCustom = (c.custom ?? {}) as Record<string, unknown>;
  const {
    auth: _auth,
    collectionViews: _collectionViews,
    search: _search,
    signIn: _customSignIn,
    ...existingFrogBot
  } = isRecord(existingCustom.frogbot) ? existingCustom.frogbot : {};

  out.custom = {
    ...existingCustom,
    frogbot: {
      ...existingFrogBot,
      auth,
      collectionViews,
      ...(search ? { search } : {}),
      ...(signIn.length
        ? {
            signIn: signIn.map((method) => ({
              slug: method.slug,
              piece: method.piece,
              label: pieceInstanceDefinition(method).label,
            })),
          }
        : {}),
    },
  };

  // Inject `req.frogbot` bootstrap as the first `beforeOperation`.
  const existingBeforeOp = (existingHooks.beforeOperation as unknown[] | undefined) ?? [];
  const setupFrogBot = (args: { req: PayloadRequest }) => bootstrapFrogBot(args, attachFrogBot);

  const hooks: Record<string, unknown[]> = {
    ...existingHooks,
    ...(orderFieldNames.length
      ? {
          beforeChange: [
            ...((existingHooks.beforeChange as unknown[] | undefined) ?? []),
            buildBoardOrderHook(orderFieldNames),
          ],
        }
      : {}),
    beforeOperation: [setupFrogBot, ...existingBeforeOp],
  };

  for (const phase of ['afterMe', 'afterLogout', 'afterError']) {
    const existing = existingHooks[phase];

    if (existing?.length) {
      hooks[phase] = [setupFrogBot, ...existing];
    }
  }

  out.hooks = hooks;

  // Wrap per-collection custom endpoints.
  const searchEndpoints = search ? buildSearchEndpoints({ collection: c.slug }) : [];

  if (c.endpoints !== undefined || signIn.length || searchEndpoints.length) {
    out.endpoints = wrapEndpoints(
      signIn.length || searchEndpoints.length
        ? [
            ...(signIn.length
              ? buildSignInEndpoints({ collectionSlug: c.slug, methods: signIn })
              : []),
            ...(c.endpoints || []),
            ...searchEndpoints,
          ]
        : c.endpoints,
      attachFrogBot,
    );
  }

  return out as unknown as PayloadCollectionConfig;
}

// ─── AI Config Sanitization ──────────────────────────────────────────────────

const defaultAccessFn = ({ req }: { req: FrogBotRequest }) => !!req.user;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function usesFileModality(modalities: unknown): boolean {
  if (!isRecord(modalities)) return false;

  return [modalities.input, modalities.output].some(
    (list) => Array.isArray(list) && list.includes('file'),
  );
}

type SanitizedAIBase = Omit<SanitizedAIConfig, 'usage'>;

function sanitizeAI(ai: AIConfig, mode: ValidationMode): SanitizedAIBase {
  // Validate providers.
  if (!isRecord(ai.providers)) {
    throw new Error('[frogbot] `ai.providers` is required and must be an object.');
  }
  const configured = Object.values(ai.providers).filter((entry) => entry != null);
  if (configured.length === 0) {
    throw new Error('[frogbot] At least one AI provider must be configured under `ai.providers`.');
  }
  for (const [key, entry] of Object.entries(ai.providers)) {
    if (entry === undefined) {
      continue;
    }
    if (!key.trim()) {
      throw new Error('[frogbot] AI provider names must not be empty.');
    }
    if (entry === true) {
      if (!isProviderName(key)) {
        throw new Error(`[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`);
      }
      continue;
    }
    if (!isRecord(entry)) {
      throw new Error(`[frogbot] Provider '${key}' must be true or an object.`);
    }
    const provider: Record<string, unknown> = entry;
    if ('type' in provider || 'baseUrl' in provider) {
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
          throw new Error(
            `[frogbot] Every model for custom provider '${key}' requires an id and mode.`,
          );
        }

        if (usesFileModality(model.modalities)) {
          throw new Error(
            `[frogbot] Model '${model.id}' for custom provider '${key}' uses the type 'file'. Rename it to 'pdf'.`,
          );
        }
      }
      continue;
    }
    if (!isProviderName(key)) {
      throw new Error(`[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`);
    }
    if (provider.models !== undefined) {
      if (!Array.isArray(provider.models)) {
        throw new Error(`[frogbot] Provider '${key}' models must be an array.`);
      }
      for (const model of provider.models) {
        if (typeof model !== 'string' || !isKnownModelId(`${key}/${model}`, new Set([key]))) {
          throw new Error(
            `[frogbot] Provider '${key}' models contains unknown model: ${String(model)}.`,
          );
        }
      }
    }
    if (key === 'bedrock') {
      const hasRegion = typeof provider.region === 'string' && !!provider.region.trim();
      const hasAccessKey =
        typeof provider.accessKeyId === 'string' && !!provider.accessKeyId.trim();
      const hasSecretKey =
        typeof provider.secretAccessKey === 'string' && !!provider.secretAccessKey.trim();
      const hasCredentialProvider = typeof provider.credentialProvider === 'function';
      if (!hasRegion && !hasAccessKey && !hasSecretKey && !hasCredentialProvider) {
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
    if (typeof provider.apiKey !== 'string' || !provider.apiKey.trim()) {
      throw new Error(
        `[frogbot] Provider '${key}' requires a non-empty apiKey when configured with an object.`,
      );
    }
  }

  // Validate routers.
  if (ai.routers !== undefined && !isRecord(ai.routers)) {
    throw new Error('[frogbot] `ai.routers` must be an object.');
  }
  const routers: Record<string, RouterConfig> = ai.routers ?? {};

  for (const [slug, router] of Object.entries(routers)) {
    if (!isRecord(router) || typeof router.model !== 'string' || !router.model.trim()) {
      throw new Error(`[frogbot] Router '${slug}' requires a model.`);
    }
  }

  const providers = new Set(
    Object.entries(ai.providers)
      .filter(([, entry]) => entry != null)
      .map(([name]) => name),
  );

  if (ai.defaultModel !== undefined) {
    const model = routers[ai.defaultModel]?.model ?? ai.defaultModel;
    const separator = model.indexOf('/');
    const provider = separator > 0 ? model.slice(0, separator) : '';

    if (!provider || !providers.has(provider)) {
      throw new Error(
        `[frogbot] defaultModel '${ai.defaultModel}' does not resolve to a configured provider or router.`,
      );
    }
  }

  const configuredModelIds = new Set(getConfiguredModelIds(ai));
  const modelChecks = [
    ['smallModel', new Set(getConfiguredChatModelIds(ai)), 'a chat model'],
    [
      'transcriptionModel',
      new Set(getConfiguredTranscriptionModelIds(ai)),
      'a transcription model',
    ],
  ] as const;

  for (const [key, modeModelIds, kind] of modelChecks) {
    const model = ai[key];

    if (model === undefined) continue;

    const target = routers[model]?.model;
    const message =
      !configuredModelIds.has(model) || (target !== undefined && !configuredModelIds.has(target))
        ? `[frogbot] ai.${key} '${model}' is not configured.`
        : !modeModelIds.has(model)
          ? `[frogbot] ai.${key} '${model}' is not ${kind}.`
          : undefined;

    if (!message) continue;

    if (mode === 'runtime') throw new Error(message);

    console.warn(message);
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
    evaluate: ai.access?.evaluate ?? defaultAccessFn,
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
    defaultModel: ai.defaultModel,
    smallModel: ai.smallModel,
    transcriptionModel: ai.transcriptionModel,
    hooks,
    access,
    telemetry,
    _internal,
  };
}

function sanitizeToolList(
  tools: readonly (AnyTool | PieceAction | PieceInstance)[],
  contextLabel: string,
): AnyTool[] {
  const context = `${contextLabel[0].toLowerCase()}${contextLabel.slice(1)}`;
  const toolSlugs = new Set<string>();
  const expanded: AnyTool[] = [];
  for (const configuredTool of tools) {
    if (isPieceInstance(configuredTool)) {
      const instanceTools = pieceInstanceTools(configuredTool);
      if (instanceTools) expanded.push(...instanceTools);
      continue;
    }
    if (isPieceAction(configuredTool)) {
      const actionTool = pieceActionTool(configuredTool);
      if (actionTool) expanded.push(actionTool);
      continue;
    }
    expanded.push(configuredTool);
  }
  return expanded.map((configuredTool) => {
    const tool = configuredTool;
    if (!isRecord(tool) || typeof tool.slug !== 'string' || !tool.slug.trim()) {
      throw new Error(`[frogbot] A tool in ${context} is missing a \`slug\`.`);
    }
    if (toolSlugs.has(tool.slug)) {
      throw new Error(`[frogbot] Duplicate tool slug '${tool.slug}' in ${context}.`);
    }
    if (typeof tool.description !== 'string' || !tool.description.trim()) {
      throw new Error(`[frogbot] Tool '${tool.slug}' in ${context} requires a description.`);
    }
    if (isClientTool(tool)) {
      if (
        !tool.inputSchema ||
        !tool.outputSchema ||
        typeof tool.client.kind !== 'string' ||
        !tool.client.kind.trim()
      ) {
        throw new Error(
          `[frogbot] Client tool '${tool.slug}' in ${context} requires inputSchema, outputSchema, and client.kind.`,
        );
      }

      toolSlugs.add(tool.slug);

      return tool;
    }

    if (!tool.inputSchema || typeof tool.execute !== 'function') {
      throw new Error(
        `[frogbot] Tool '${tool.slug}' in ${context} requires inputSchema and execute.`,
      );
    }
    toolSlugs.add(tool.slug);
    const sanitizedTool: AnyTool = {
      ...tool,
      description: tool.description,
      execute: tool.execute,
      inputSchema: tool.inputSchema,
      slug: tool.slug,
    };
    return sanitizedTool;
  });
}

function sanitizeSkills(agentSlug: string, skills: readonly SkillConfig[]): void {
  const skillSlugs = new Set<string>();
  for (const skill of skills) {
    if (!isRecord(skill) || typeof skill.slug !== 'string' || !skill.slug.trim()) {
      throw new Error(`[frogbot] Agent '${agentSlug}' has a skill missing a \`slug\`.`);
    }
    if (skill.slug !== skill.slug.trim() || encodeURIComponent(skill.slug) !== skill.slug) {
      throw new Error(
        `[frogbot] Skill slug '${skill.slug}' in agent '${agentSlug}' is not URL-safe.`,
      );
    }
    if (skillSlugs.has(skill.slug)) {
      throw new Error(`[frogbot] Duplicate skill slug '${skill.slug}' in agent '${agentSlug}'.`);
    }
    skillSlugs.add(skill.slug);
    if (
      typeof skill.instructions !== 'function' &&
      (typeof skill.instructions !== 'string' || !skill.instructions.trim())
    ) {
      throw new Error(
        `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' requires instructions.`,
      );
    }
    for (const field of ['description', 'license', 'compatibility'] as const) {
      const value = skill[field];
      if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
        throw new Error(
          `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' ${field} must be a non-empty string.`,
        );
      }
    }
    if (
      skill.metadata !== undefined &&
      (!isRecord(skill.metadata) ||
        Object.values(skill.metadata).some((value) => typeof value !== 'string'))
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
      if (!isRecord(resource) || typeof resource.path !== 'string' || !resource.path.trim()) {
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
        (typeof resource.description !== 'string' || !resource.description.trim())
      ) {
        throw new Error(
          `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' resource '${resource.path}' description must be a non-empty string.`,
        );
      }
      if (
        typeof resource.content !== 'function' &&
        (typeof resource.content !== 'string' || !resource.content.trim())
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
  mode: ValidationMode,
  rootTools: AnyTool[],
): SanitizedAgentConfig[] | undefined {
  if (!Array.isArray(agents)) {
    throw new Error('[frogbot] `agents` must be an array.');
  }
  if (agents.length === 0) {
    return undefined;
  }
  if (!ai) {
    throw new Error('[frogbot] `agents` requires an `ai` configuration block.');
  }

  const configuredModels = new Set(getConfiguredModelIds(ai));
  const chatModels = new Set(getConfiguredChatModelIds(ai));
  const slugs = new Set<string>();
  const channelOwners = new Map<PieceInstance, string>();

  return agents.map<SanitizedAgentConfig>((agent) => {
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

    const modelConfig =
      typeof agent.model === 'object' && agent.model !== null ? agent.model : undefined;
    const modelId =
      typeof agent.model === 'string' ? agent.model : (modelConfig?.default ?? ai.defaultModel);

    const allowModels = (agent as AgentConfig & { allowModels?: unknown }).allowModels;

    if (allowModels !== undefined) {
      const options = Array.isArray(allowModels)
        ? `[${allowModels.map((model) => `'${model}'`).join(', ')}]`
        : '[...]';

      throw new Error(
        `[frogbot] Agent '${agent.slug}' uses \`allowModels\`, which was removed. Use \`model: { default: '${modelId ?? '<default>'}', options: ${options} }\`.`,
      );
    }

    if (typeof modelId !== 'string' || !modelId.trim()) {
      throw new Error(
        `[frogbot] Agent '${agent.slug}' requires a \`model\` or \`ai.defaultModel\`.`,
      );
    }

    const options = modelConfig?.options;

    if (modelConfig && options !== '*' && !Array.isArray(options)) {
      throw new Error(`[frogbot] Agent '${agent.slug}' model.options must be \`'*'\` or an array.`);
    }

    const modelOptions = options === '*' ? [...chatModels] : (options ?? []);

    if (typeof agent.instructions !== 'string' || !agent.instructions.trim()) {
      throw new Error(`[frogbot] Agent '${agent.slug}' requires \`instructions\`.`);
    }
    if (agent.profile !== undefined) {
      if (!isRecord(agent.profile)) {
        throw new Error(`[frogbot] Agent '${agent.slug}' profile must be an object.`);
      }
      for (const field of ['name', 'avatar', 'description'] as const) {
        const value = agent.profile[field];
        if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
          throw new Error(
            `[frogbot] Agent '${agent.slug}' profile ${field} must be a non-empty string.`,
          );
        }
      }
    }
    if (agent.access !== undefined && typeof agent.access !== 'function') {
      throw new Error(`[frogbot] Agent '${agent.slug}' access must be a function.`);
    }

    if (agent.channels !== undefined) {
      if (!Array.isArray(agent.channels)) {
        throw new Error(
          `[frogbot] Agent '${agent.slug}' channels must be an array when configured.`,
        );
      }

      for (const instance of agent.channels) {
        if (!isPieceInstance(instance) || !instance[pieceCapabilities].channel) {
          throw new Error(
            `[frogbot] Every channel in agent '${agent.slug}' must be a channel-capable piece instance.`,
          );
        }

        if (pieceInstanceRuntime(instance).auth === undefined) {
          throw new Error(
            `[frogbot] Channel '${instance.slug}' in agent '${agent.slug}' requires factory auth.`,
          );
        }

        const owner = channelOwners.get(instance);

        if (owner) {
          throw new Error(
            `[frogbot] Channel '${instance.slug}' is mounted by agents '${owner}' and '${agent.slug}'. Create a separate instance for each agent.`,
          );
        }

        channelOwners.set(instance, agent.slug);
      }
    }

    if (
      agent.stopWhen !== undefined &&
      typeof agent.stopWhen !== 'function' &&
      (!Array.isArray(agent.stopWhen) ||
        agent.stopWhen.length === 0 ||
        agent.stopWhen.some((condition) => typeof condition !== 'function'))
    ) {
      throw new Error(
        `[frogbot] Agent '${agent.slug}' stopWhen must contain at least one condition.`,
      );
    }

    for (const [field, candidate] of [
      [modelConfig ? 'model.default' : 'model', modelId],
      ...(options !== '*' ? modelOptions.map((model) => ['model.options', model]) : []),
    ] as Array<[string, unknown]>) {
      if (typeof candidate !== 'string' || !candidate.trim()) {
        throw new Error(`[frogbot] Agent '${agent.slug}' ${field} must contain model IDs.`);
      }

      const message = !configuredModels.has(candidate)
        ? `[frogbot] Agent '${agent.slug}' ${field} '${candidate}' is not configured.`
        : !chatModels.has(candidate)
          ? `[frogbot] Agent '${agent.slug}' ${field} '${candidate}' is not chat-capable.`
          : undefined;

      if (message) {
        if (mode === 'runtime') throw new Error(message);

        console.warn(message);
      }
    }

    let agentTools: AnyTool[] | undefined;
    if (agent.tools !== undefined) {
      if (!Array.isArray(agent.tools)) {
        throw new Error(`[frogbot] Agent '${agent.slug}' tools must be an array when configured.`);
      }
      agentTools = sanitizeToolList(agent.tools, `Agent '${agent.slug}'`);
    }
    if (agent.inheritTools !== false && rootTools.length > 0) {
      const agentToolSlugs = new Set(agentTools?.map(({ slug }) => slug));
      for (const slug of agentToolSlugs) {
        if (rootTools.some((tool) => tool.slug === slug)) {
          console.warn(
            `[frogbot] Agent '${agent.slug}' tool '${slug}' shadows root tool '${slug}'.`,
          );
        }
      }
      const inheritedTools = rootTools.filter(({ slug }) => !agentToolSlugs.has(slug));
      agentTools = [...inheritedTools, ...(agentTools ?? [])];
      agent = { ...agent, tools: agentTools };
    } else if (agentTools !== undefined) {
      agent = { ...agent, tools: agentTools };
    }

    if (agent.skills !== undefined) {
      if (!Array.isArray(agent.skills)) {
        throw new Error(`[frogbot] Agent '${agent.slug}' skills must be an array when configured.`);
      }
      sanitizeSkills(agent.slug, agent.skills);
      if (agent.skills.length > 0) {
        const toolSlugs = new Set(agentTools?.map(({ slug }) => slug));
        for (const slug of ['list_skills', 'load_skill', 'load_skill_resource']) {
          if (toolSlugs.has(slug)) {
            throw new Error(`[frogbot] Tool slug '${slug}' is reserved for agent skills.`);
          }
        }
        const skillLines = agent.skills.map(
          ({ slug, description }) => `- **${slug}**${description ? `: ${description}` : ''}`,
        );
        agentTools = [...(agentTools ?? []), ...buildSkillTools(agent.skills)];
        agent = {
          ...agent,
          instructions: `${agent.instructions}\n\n${skillLines.join('\n')}`,
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
        if (isRecord(trigger) && 'trigger' in trigger) continue;
        if (
          !isRecord(trigger) ||
          trigger.type !== 'schedule' ||
          typeof trigger.slug !== 'string' ||
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
        const hasPrompt = typeof trigger.prompt === 'string';
        const hasHandler = typeof trigger.handler === 'function';
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
        const hasEvery = typeof trigger.schedule.every === 'string';
        const hasCron = typeof trigger.schedule.cron === 'string';
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

    return {
      ...agent,
      model: {
        default: modelId,
        options: [...new Set([modelId, ...modelOptions])] as AgentModelId[],
      },
      access: agent.access ?? defaultAccessFn,
      tools: agentTools,
    };
  });
}

type CollectPieceInstancesProps = {
  config: FrogBotConfig;
  agents: SanitizedAgentConfig[] | undefined;
  rootTools: AnyTool[];
  triggers: IngressRegistry;
  connections: SanitizedConnectionsConfig;
};

function collectPieceInstances({
  config,
  agents,
  rootTools,
  triggers,
  connections,
}: CollectPieceInstancesProps): SanitizedPiecesConfig {
  const configuredTools = [
    ...(config.tools ?? []),
    ...(config.agents ?? []).flatMap((agent) => agent.tools ?? []),
  ];
  const sanitizedTools = [...rootTools, ...(agents ?? []).flatMap((agent) => agent.tools ?? [])];

  return {
    instances: [
      ...new Set([
        ...Object.values(triggers).map(({ instance }) => instance),
        ...(config.agents ?? []).flatMap((agent) => agent.channels ?? []),
        ...configuredTools.filter(isPieceInstance),
        ...sanitizedTools.flatMap((tool) => pieceToolInstance(tool) ?? []),
        ...Object.values(connections.entries).map(({ piece }) => piece),
      ]),
    ],
  };
}

function validateInternalPathReservations(
  config: Pick<FrogBotConfig, 'collections' | 'endpoints'>,
): void {
  for (const [slug, api] of [
    ['agents', 'agent'],
    ['connections', 'connections'],
    ['frogbot', 'manifest'],
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
        `[frogbot] Endpoint path '${endpoint.path}' is reserved for the manifest API.`,
      );
    }
    if (endpoint.path === '/v1' || endpoint.path.startsWith('/v1/')) {
      throw new Error(
        `[frogbot] Endpoint path '${endpoint.path}' is reserved for the AI gateway API.`,
      );
    }
  }
}

function sanitizeSettings(settings: SettingsEntry[] | undefined): SettingsEntry[] {
  if (settings === undefined) return [];
  if (!Array.isArray(settings)) {
    throw new Error('[frogbot] `settings` must be an array.');
  }
  const paths = new Set<string>();
  return settings.map((entry) => {
    if (!isRecord(entry) || typeof entry.path !== 'string') {
      throw new Error('[frogbot] Every settings entry requires a path.');
    }
    const path = entry.path;
    const segments = path.split('/');
    if (
      !path ||
      path !== path.trim() ||
      path.startsWith('/') ||
      path.includes('\\') ||
      path.includes('?') ||
      path.includes('#') ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      throw new Error(`[frogbot] Settings path '${path}' must be a normalized relative path.`);
    }
    if (paths.has(path)) {
      throw new Error(`[frogbot] Duplicate settings path '${path}'.`);
    }
    paths.add(path);

    validateAdminIcon(entry.icon);

    return entry;
  });
}

function viewTitleText(title: unknown): string | undefined {
  if (typeof title === 'string') {
    return title === '' ? undefined : title;
  }

  if (typeof title === 'object' && title !== null) {
    const { absolute, default: fallback } = title as { absolute?: unknown; default?: unknown };

    if (typeof absolute === 'string' && absolute !== '') return absolute;

    if (typeof fallback === 'string' && fallback !== '') return fallback;
  }

  return undefined;
}

function fillViewMeta(
  view: Record<string, unknown>,
  adminMeta: RootAdminMetaConfig,
): Record<string, unknown> {
  const meta =
    typeof view.meta === 'object' && view.meta !== null && !Array.isArray(view.meta)
      ? (view.meta as RootAdminMetaConfig)
      : {};

  const ownText = viewTitleText(meta.title ?? adminMeta.title);
  const own = ownText !== undefined;
  const text = ownText ?? adminMeta.openGraph?.siteName ?? 'FrogBot';
  const restMeta = { ...meta };

  if (!own) delete restMeta.title;

  return {
    ...view,
    meta: {
      ...(own ? {} : { title: text, titleSuffix: meta.titleSuffix ?? '' }),
      ...(meta.description === undefined && adminMeta.description === undefined
        ? { description: text }
        : {}),
      ...(meta.keywords === undefined && adminMeta.keywords === undefined
        ? { keywords: text }
        : {}),
      ...restMeta,
      openGraph: {
        ...(meta.openGraph?.title === undefined && adminMeta.openGraph?.title === undefined
          ? { title: text }
          : {}),
        ...meta.openGraph,
      },
    },
  };
}

// ─── Payload Config Building ─────────────────────────────────────────────────

function buildPayloadConfig(
  config: FrogBotConfig,
  onInit: NonNullable<PayloadConfig['onInit']>,
  internalEndpoints: Endpoint[] = [],
  attachFrogBot: AttachFrogBot,
  resolveFrogBot: ResolveFrogBot,
  searchCollections: SearchCollection[] = [],
  autonumbers: AutonumberEntry[] = [],
): PayloadConfig {
  const frogbotKeys = new Set([
    'agents',
    'ai',
    'connections',
    'email',
    'onInit',
    'plugins',
    'port',
    'settings',
    'tools',
  ]);

  const mapVectorField = config.db.mapVectorField;

  const authSlugs = config.collections
    .filter((collection) => Boolean(collection.auth))
    .map(({ slug }) => slug);
  const users: SystemKindUsers = {
    authSlugs: authSlugs.length ? authSlugs : ['users'],
    resolve: () => resolveUserSlug(config),
  };

  const collections = config.collections.map((collection) =>
    sanitizeCollection(
      collection.auth && !collection.admin?.icon
        ? { ...collection, admin: { ...collection.admin, icon: 'people' } }
        : collection,
      attachFrogBot,
      {
        mapVectorField,
        onAutonumber: (path) => autonumbers.push({ collection: collection.slug, path }),
        resolveFrogBot,
        search: searchCollections.find(({ slug }) => slug === collection.slug)?.search,
        users,
      },
    ),
  );
  if (!collections.some((collection) => Boolean(collection.auth))) {
    collections.push(
      sanitizeCollection(
        {
          slug: 'users',
          admin: { icon: 'people', useAsTitle: 'name' },
          auth: { tokenExpiration: 7200 },
          fields: [{ name: 'name', type: 'text' }],
        },
        attachFrogBot,
        { mapVectorField, resolveFrogBot, users },
      ),
    );
  }
  if (autonumbers.length) {
    collections.push(
      sanitizeCollection(defaultAutonumbersCollection(), attachFrogBot, {
        mapVectorField,
        resolveFrogBot,
        users,
      }),
    );
  }
  const out: Record<string, unknown> = {
    ...Object.fromEntries(Object.entries(config).filter(([key]) => !frogbotKeys.has(key))),
    ...(config.blocks
      ? {
          blocks: config.blocks.map((block) => ({
            ...block,
            fields: wrapFieldRequestFunctions(
              sanitizeVectorFields({
                block: block.slug,
                fields: block.fields,
                mapVectorField,
                users,
              }),
            ),
          })),
        }
      : {}),
    collections,
    hooks: wrapRootHooks(config.hooks, attachFrogBot),
    ...(config.localization !== undefined
      ? { localization: wrapLocalization(config.localization, attachFrogBot) }
      : {}),
    routes: {
      ...config.routes,
      admin: config.routes?.admin ?? '/',
    },
  };

  if (collections.some((collection) => collection.custom?.frogbot?.signIn?.length)) {
    const adapter = config.db as PayloadConfig['db'];
    const db: PayloadConfig['db'] = {
      ...adapter,
      init(args) {
        const database = adapter.init(args);
        if (
          database.name === 'sqlite' &&
          (!('transactionOptions' in database) || !database.transactionOptions)
        ) {
          throw new Error(
            '[frogbot] SQLite signIn requires transactions. Remove transactionOptions: false or set transactionOptions: {} in sqliteAdapter().',
          );
        }
        return database;
      },
    };
    out.db = db;
  }

  const userEndpoints = config.endpoints as Endpoint[] | false | undefined;
  const agentEndpoints = config.agents?.length ? buildAgentEndpoints() : [];
  const allEndpoints = [
    ...buildResumeEndpoints(),
    ...(Array.isArray(userEndpoints) ? userEndpoints : []),
    buildManifestEndpoint(),
    ...agentEndpoints,
    ...internalEndpoints,
  ];

  if (allEndpoints.length > 0) {
    out.endpoints = wrapEndpoints(allEndpoints, attachFrogBot);
  } else if (userEndpoints === false) {
    out.endpoints = false;
  } else if (userEndpoints !== undefined) {
    out.endpoints = wrapEndpoints(userEndpoints, attachFrogBot);
  }

  if (config.graphQL || searchCollections.length) {
    const queries = wrapGraphQLExtension(config.graphQL?.queries, attachFrogBot);
    const mutations = wrapGraphQLExtension(config.graphQL?.mutations, attachFrogBot);

    const searchQueries = searchCollections.length
      ? buildSearchQueries({
          attachFrogBot,
          collections: searchCollections.map(({ slug }) => slug),
        })
      : undefined;

    const graphQL: PayloadConfig['graphQL'] = {
      ...config.graphQL,
      ...(searchQueries || queries
        ? {
            queries: (graphQLModule, context) => ({
              ...searchQueries?.(graphQLModule, context),
              ...queries?.(graphQLModule, context),
            }),
          }
        : {}),
      ...(mutations ? { mutations } : {}),
    };

    out.graphQL = graphQL;
  }

  out.email =
    config.email === undefined
      ? noopEmailAdapter
      : config.email instanceof Promise
        ? config.email.then(pieceEmailAdapter)
        : pieceEmailAdapter(config.email);

  out.typescript = {
    ...(config as { typescript?: Record<string, unknown> }).typescript,
    autoGenerate: false,
  };
  out.cookiePrefix = config.cookiePrefix ?? 'frogbot';

  const admin = (
    config as {
      admin?: {
        components?: { graphics?: Record<string, unknown> } & Record<string, unknown>;
        importMap?: Record<string, unknown>;
        meta?: { openGraph?: Record<string, unknown> } & Record<string, unknown>;
      } & Record<string, unknown>;
    }
  ).admin;
  const settings = sanitizeSettings(config.settings);
  const dashboard = admin?.dashboard as
    | {
        defaultLayout?: ((args: { req: FrogBotRequest }) => unknown) | unknown[];
        widgets: unknown[];
      }
    | undefined;
  const defaultLayout = dashboard?.defaultLayout;
  const adaptedDashboard = dashboard
    ? {
        ...dashboard,
        ...(typeof defaultLayout === 'function'
          ? {
              defaultLayout: async ({ req }: { req: PayloadRequest }) =>
                defaultLayout({ req: await attachFrogBot(req) }),
            }
          : {}),
      }
    : undefined;
  const hasAdminSignIn = config.collections.some(
    ({ slug, auth }) =>
      typeof auth === 'object' && auth.signIn?.length && slug === resolveUserSlug(config),
  );
  const toolComponents = Object.fromEntries(
    (config.agents ?? []).flatMap((agent) => {
      const components = Object.fromEntries(
        (agent.tools ?? []).flatMap((tool) =>
          'component' in tool && tool.component !== undefined ? [[tool.slug, tool.component]] : [],
        ),
      );
      return Object.keys(components).length > 0 ? [[agent.slug, components]] : [];
    }),
  );

  const adminMeta: RootAdminMetaConfig = {
    defaultOGImageType: 'static',
    titleSuffix: '- FrogBot',
    ...admin?.meta,
    openGraph: {
      description:
        'FrogBot is an open-source AI agent framework you configure in one TypeScript file, then deploy anywhere or run as a Docker image.',
      siteName: 'FrogBot',
      ...admin?.meta?.openGraph,
    },
  };

  out.admin = {
    ...admin,
    ...(admin?.livePreview
      ? { livePreview: wrapLivePreview(config.admin?.livePreview, attachFrogBot) }
      : {}),
    ...(adaptedDashboard ? { dashboard: adaptedDashboard } : {}),
    components: {
      ...admin?.components,
      ...(hasAdminSignIn
        ? {
            afterLogin: [
              ...((admin?.components?.afterLogin as unknown[] | undefined) ?? []),
              '@frogbotai/next/rsc#SignInButtons',
            ],
          }
        : {}),
      ...(admin?.components?.chat || Object.keys(toolComponents).length > 0
        ? {
            chat: {
              ...(admin?.components?.chat as Record<string, unknown> | undefined),
              ...(Object.keys(toolComponents).length > 0 ? { toolComponents } : {}),
            },
          }
        : {}),
      Nav: admin?.components?.Nav ?? '@frogbotai/next/rsc#FrogBotNav',
      navSections: admin?.components?.navSections ?? ['@frogbotai/next#CollectionsSection'],
      providers: [
        ...((admin?.components?.providers as unknown[] | undefined) ?? []),
        '@frogbotai/next/client#StepNavReset',
      ],
      graphics: {
        Icon: '@frogbotai/next/rsc#FrogBotIcon',
        Logo: '@frogbotai/next/rsc#FrogBotLogo',
        ...admin?.components?.graphics,
      },
      views: Object.fromEntries(
        Object.entries({
          ...(admin?.components?.views as Record<string, unknown> | undefined),
          settings:
            (admin?.components?.views as Record<string, unknown> | undefined)?.settings ??
            ({
              Component: '@frogbotai/next/views#SettingsView',
              exact: false,
              path: '/settings',
              meta: { title: 'Settings' },
            } as const),
        }).map(([key, view]) => [
          key,
          key === 'account' ||
          key === 'dashboard' ||
          typeof view !== 'object' ||
          view === null ||
          Array.isArray(view)
            ? view
            : fillViewMeta(view as Record<string, unknown>, adminMeta),
        ]),
      ),
    },
    meta: adminMeta,
    importMap: {
      baseDir: resolveSourceDir(process.cwd()),
      ...admin?.importMap,
      autoGenerate: false,
    },
    settings,
  };

  const i18n = (
    config as {
      i18n?: { translations?: Record<string, unknown> } & Record<string, unknown>;
    }
  ).i18n;
  const en = i18n?.translations?.en as
    ({ general?: Record<string, unknown> } & Record<string, unknown>) | undefined;
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

  out.onInit = onInit;

  return out as unknown as PayloadConfig;
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

  if ((config as unknown as Record<string, unknown>).globals !== undefined) {
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

  validateInternalPathReservations(config);
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

  // Sanitize AI config if present.
  let sanitizedAI = config.ai ? sanitizeAI(config.ai, mode) : undefined;
  if (sanitizedAI) {
    const authCollection = resolveUserSlug(config);
    const policyHooks = createPolicyHooks({
      authCollection,
      providers: sanitizedAI.providers,
    });
    sanitizedAI = {
      ...sanitizedAI,
      hooks: {
        ...sanitizedAI.hooks,
        beforeOperation: [policyHooks.beforeOperation, ...sanitizedAI.hooks.beforeOperation],
        afterOperation: [...sanitizedAI.hooks.afterOperation, policyHooks.afterOperation],
      },
    };
    const policyFields = createPolicyFields(getConfiguredModelIds(config.ai));
    const hasAuthCollection = config.collections.some(
      (collection) => collection.slug === authCollection,
    );
    config = {
      ...config,
      collections: [
        ...config.collections.map((collection) =>
          collection.slug === authCollection
            ? { ...collection, fields: mergePolicyFields(collection.fields, policyFields) }
            : collection,
        ),
        ...(hasAuthCollection
          ? []
          : [
              {
                slug: authCollection,
                admin: { useAsTitle: 'name' },
                auth: { tokenExpiration: 7200 },
                fields: [{ name: 'name', type: 'text' }, ...policyFields],
              } as CollectionConfig,
            ]),
      ],
      jobs: {
        ...config.jobs,
        tasks: [
          ...(config.jobs?.tasks ?? []).filter((task) => task.slug !== 'frogbot-reset-ai-budgets'),
          {
            slug: 'frogbot-reset-ai-budgets',
            interfaceName: 'TaskFrogBotResetAiBudgets',
            schedule: [{ cron: '0 0 1 * *', queue: 'frogbot-reset-ai-budgets' }],
            handler: async ({ req }) => {
              await req.payload.update({
                collection: authCollection,
                where: { id: { exists: true } },
                data: { spendThisPeriodUSD: 0 },
                overrideAccess: true,
                req,
              });
              return { output: {} };
            },
          },
        ],
      },
    };
  }

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
  const agents =
    config.agents !== undefined
      ? sanitizeAgents(config.agents, sanitizedAI, mode, rootTools)
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

  // Resolve chat persistence — adopt marked collections or inject defaults.
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

  config = applyStorageAdapters({
    config: { ...config, collections: resolvedCollections, onInit: normalizeOnInit(config.onInit) },
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
      Component: '@frogbotai/next/views#ConnectionsView',
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

  // Build collection metadata for FrogBot's sanitized config.
  const localizeStatus = config.experimental?.localizeStatus === true;

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

  // Build the Payload config and pass it through Payload's buildConfig.
  const payloadConfig = buildPayloadConfig(
    { ...config, agents, collections: payloadCollections, jobs, kv, settings },
    async (payload) => {
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
    [
      ...(chat.enabled ? buildChatEndpoints() : []),
      ...(Object.keys(triggers).length ? buildTriggerEndpoints() : []),
      ...(hasChannelAdapters ? buildChannelGatewayEndpoints() : []),
      ...(searchCollections.length ? [buildSearchManyEndpoint()] : []),
    ],
    attachFrogBot,
    resolveFrogBot,
    searchCollections,
    autonumbers,
  );
  payloadConfig.db = withSearchRuntime({
    adapter: withJobsRuntime({
      adapter: payloadConfig.db,
      leaseDuration: jobs.leaseDuration,
    }),
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
    port: (config as any).port, // eslint-disable-line @typescript-eslint/no-explicit-any
    onInit: normalizeOnInit(config.onInit),
    ai: sanitizedAI && { ...sanitizedAI, usage: { slug: usageSlug } },
    agents,
    chat,
    connections,
    files,
    pieces,
    roles: config._roles?.roles ?? [],
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
