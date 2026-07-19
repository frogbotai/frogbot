// createGateway() — the public factory for constructing a gateway instance.
//
// Returns a `handler` (WinterCG fetch function) and modality resolvers.
// The handler can be mounted in any Hono/Bun/Deno/Workers/Next app, or used
// directly by the CLI.

import type {
  Experimental_VideoModelV4,
  ImageModelV4,
} from '@ai-sdk/provider';

import { createApp, getRoutes, type GatewayRoutes } from './app.js';
import { finalizeConfig } from './config/parse.js';
import type { GatewayConfig } from './config/schema.js';
import { DEFAULT_MODEL_CATALOG } from './providers/catalog.data.js';
import {
  buildProviderRegistry,
  requireRerankingModel,
  requireSpeechModel,
  requireTranscriptionModel,
  requireVideoModel,
  resolveProvider,
  type GatewayEmbeddingModel,
  type GatewayLanguageModel,
  type GatewayRerankingModel,
  type GatewaySpeechModel,
  type GatewayTranscriptionModel,
  type ProviderRegistry,
} from './providers/registry.js';
import type { Hooks, HookOperation, HookUsage, OperationBase } from './hooks.js';
import { runHooks } from './hooks.js';
import { mergeHooks } from './providers/middleware.js';
import {
  withEmbeddingModelHooks,
  withImageModelHooks,
  withLanguageModelHooks,
  withRerankingModelHooks,
  withSpeechModelHooks,
  withTranscriptionModelHooks,
  withVideoModelHooks,
} from './modelHooks.js';

function deepFreeze<T extends Record<string, unknown>>(obj: T): Readonly<T> {
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value as Record<string, unknown>);
    }
  }
  return Object.freeze(obj);
}

// Tool loops fire multiple upstream rounds per operation — usage is summed
// across rounds with ADD semantics (optional partitions stay undefined until
// a round reports them).
const addOptionalTokens = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

function addUsage(acc: HookUsage | undefined, next: HookUsage): HookUsage {
  if (!acc) return { ...next };
  return {
    inputTokens: acc.inputTokens + next.inputTokens,
    outputTokens: acc.outputTokens + next.outputTokens,
    totalTokens: acc.totalTokens + next.totalTokens,
    cachedInputTokens: addOptionalTokens(acc.cachedInputTokens, next.cachedInputTokens),
    cacheWriteTokens: addOptionalTokens(acc.cacheWriteTokens, next.cacheWriteTokens),
    reasoningTokens: addOptionalTokens(acc.reasoningTokens, next.reasoningTokens),
  };
}

export type GatewayOperationOptions = {
  operation: HookOperation;
  /** Canonical `provider/model` ID the operation targets. */
  model: string;
  /** Seeds the shared mutable context bag visible to every hook phase. */
  context?: Record<string, unknown>;
  /** Present only when the operation originates from an HTTP entry. */
  request?: Request;
};

/**
 * A first-class in-process operation: one requestId + one shared context bag
 * across the full 5-phase hook lifecycle. `start()` gates via
 * `beforeOperation`; the model getters join the operation (upstream hooks see
 * the shared base); `finish()` fires `afterOperation` with accumulated
 * finishReason/usage/error.
 */
export type GatewayOperation = {
  readonly requestId: string;
  readonly context: Record<string, unknown>;
  /** Fires `beforeOperation` hooks. NOT isolated — a throw propagates (it's a gate). */
  start: () => Promise<void>;
  /**
   * Fires `afterOperation` hooks (isolated) with explicit values when given,
   * else values accumulated from upstream rounds. Idempotent.
   */
  finish: (result?: { finishReason?: string; usage?: HookUsage; error?: unknown }) => Promise<void>;
  chatModel: () => GatewayLanguageModel;
  embedModel: () => GatewayEmbeddingModel;
  imageModel: () => ImageModelV4;
  videoModel: () => Experimental_VideoModelV4;
  speechModel: () => GatewaySpeechModel;
  transcribeModel: () => GatewayTranscriptionModel;
  rerankModel: () => GatewayRerankingModel;
};

export type Gateway = {
  /**
   * WinterCG-compatible fetch handler. Mount on any framework. In-process
   * callers can seed the hook `context` bag via the second argument:
   * `gateway.handler(req, { context: { req, user } })`. External wire traffic
   * can never set it — it only comes from this argument.
   */
  handler: (request: Request, opts?: { context?: Record<string, unknown> }) => Response | Promise<Response>;
  /**
   * Per-endpoint handlers for selective mounting. Keyed by bare HTTP path, e.g.
   * `app.mount('/v1/chat', gw.routes['/chat/completions'].handler)`.
   */
  routes: GatewayRoutes;
  /** Resolve a `provider/model` ID to an AI SDK LanguageModel for in-process chat calls. */
  chatModel: (id: string) => GatewayLanguageModel;
  /** Resolve a `provider/model` ID to an AI SDK EmbeddingModel for in-process embed calls. */
  embedModel: (id: string) => GatewayEmbeddingModel;
  /** Resolve a `provider/model` ID to an AI SDK ImageModel for in-process image generation calls. */
  imageModel: (id: string) => ImageModelV4;
  videoModel: (id: string) => Experimental_VideoModelV4;
  speechModel: (id: string) => GatewaySpeechModel;
  transcribeModel: (id: string) => GatewayTranscriptionModel;
  rerankModel: (id: string) => GatewayRerankingModel;
  /** Create an in-process operation with the full 5-phase hook lifecycle. */
  operation: (opts: GatewayOperationOptions) => GatewayOperation;
  /** The constructed provider registry (for advanced use). */
  registry: ProviderRegistry;
  readonly hooks: Readonly<Hooks>;
};

/**
 * Construct a gateway instance from a config object.
 *
 * ```ts
 * const gw = createGateway({ providers: { openai: { apiKey: 'sk-...' } } })
 * app.mount('/v1', gw.handler)
 * ```
 */
export function createGateway(config: GatewayConfig): Gateway {
  // finalizeConfig applies enabled_providers / disabled_providers filtering
  // before validation. Idempotent (kParsed), so the CLI's own finalizeConfig
  // call is a no-op here.
  const validated = finalizeConfig(config);
  const registry = buildProviderRegistry(validated.providers, validated.openaiCompatible);

  // Shared modality resolvers — one per operation kind, closed over `registry`.
  // Both the public `gateway.xModel(id)` getters and `gateway.operation(...)`
  // use these; the only per-call variation is `hooks` (the operation merges in
  // its accumulators) and `base` (present so upstream hooks join the operation
  // lifecycle instead of minting a fresh one).
  const resolvers = {
    chatModel: (id: string, hooks?: Hooks, base?: OperationBase): GatewayLanguageModel => {
      const resolved = resolveProvider({ modelId: id, operation: 'chat.completions', providers: registry });
      return withLanguageModelHooks(resolved.instance.languageModel(resolved.modelName), {
        hooks: hooks ?? validated.hooks,
        model: id,
        operation: 'chat.completions',
        provider: resolved.providerName,
        base,
      });
    },
    embedModel: (id: string, hooks?: Hooks, base?: OperationBase): GatewayEmbeddingModel => {
      const resolved = resolveProvider({ modelId: id, operation: 'embeddings', providers: registry });
      return withEmbeddingModelHooks(resolved.instance.embeddingModel(resolved.modelName), {
        hooks: hooks ?? validated.hooks,
        model: id,
        operation: 'embeddings',
        provider: resolved.providerName,
        base,
      });
    },
    imageModel: (id: string, hooks?: Hooks, base?: OperationBase): ImageModelV4 => {
      const resolved = resolveProvider({ modelId: id, operation: 'images.generations', providers: registry });
      return withImageModelHooks(resolved.instance.imageModel(resolved.modelName), {
        hooks: hooks ?? validated.hooks,
        model: id,
        operation: 'images',
        provider: resolved.providerName,
        base,
      });
    },
    videoModel: (id: string, hooks?: Hooks, base?: OperationBase): Experimental_VideoModelV4 => {
      const resolved = resolveProvider({ modelId: id, operation: 'video.generations', providers: registry });
      const model = requireVideoModel({
        provider: resolved.instance,
        providerName: resolved.providerName,
        modelName: resolved.modelName,
      });
      return withVideoModelHooks(model, {
        hooks: hooks ?? validated.hooks,
        model: id,
        operation: 'videos',
        provider: resolved.providerName,
        base,
      });
    },
    speechModel: (id: string, hooks?: Hooks, base?: OperationBase): GatewaySpeechModel => {
      const resolved = resolveProvider({ modelId: id, operation: 'audio.speech', providers: registry });
      const model = requireSpeechModel({
        provider: resolved.instance,
        providerName: resolved.providerName,
        modelName: resolved.modelName,
      });
      return withSpeechModelHooks(model, {
        hooks: hooks ?? validated.hooks,
        model: id,
        operation: 'speech',
        provider: resolved.providerName,
        base,
      });
    },
    transcribeModel: (id: string, hooks?: Hooks, base?: OperationBase): GatewayTranscriptionModel => {
      const resolved = resolveProvider({ modelId: id, operation: 'audio.transcriptions', providers: registry });
      const model = requireTranscriptionModel({
        provider: resolved.instance,
        providerName: resolved.providerName,
        modelName: resolved.modelName,
      });
      return withTranscriptionModelHooks(model, {
        hooks: hooks ?? validated.hooks,
        model: id,
        operation: 'transcriptions',
        provider: resolved.providerName,
        base,
      });
    },
    rerankModel: (id: string, hooks?: Hooks, base?: OperationBase): GatewayRerankingModel => {
      const resolved = resolveProvider({ modelId: id, operation: 'rerank', providers: registry });
      const model = requireRerankingModel({
        provider: resolved.instance,
        providerName: resolved.providerName,
        modelName: resolved.modelName,
      });
      return withRerankingModelHooks(model, {
        hooks: hooks ?? validated.hooks,
        model: id,
        operation: 'rerank',
        provider: resolved.providerName,
        base,
      });
    },
  };

  const app = createApp({
    registry,
    catalog: validated.catalog ?? DEFAULT_MODEL_CATALOG,
    basePath: validated.basePath,
    hooks: validated.hooks,
    maxBodyBytes: validated.maxBodyBytes,
    upstreamTimeoutMs: validated.upstreamTimeoutMs,
    tracing: validated.tracing,
    tracer: validated.tracer,
    logger: validated.logger,
    signalLevel: validated.signalLevel,
  });

  return {
    handler: (request: Request, opts?: { context?: Record<string, unknown> }) =>
      app.fetch(request, { context: opts?.context ?? {} }),
    routes: getRoutes(app) ?? ({} as GatewayRoutes),
    chatModel: (id: string) => resolvers.chatModel(id),
    embedModel: (id: string) => resolvers.embedModel(id),
    imageModel: (id: string) => resolvers.imageModel(id),
    videoModel: (id: string) => resolvers.videoModel(id),
    speechModel: (id: string) => resolvers.speechModel(id),
    transcribeModel: (id: string) => resolvers.transcribeModel(id),
    rerankModel: (id: string) => resolvers.rerankModel(id),
    operation: (opts: GatewayOperationOptions): GatewayOperation => {
      const base: OperationBase = {
        operation: opts.operation,
        requestId: `req_${crypto.randomUUID()}`,
        startedAt: Date.now(),
        context: opts.context ?? {},
        otel: {},
        model: opts.model,
        provider: opts.model.split('/', 1)[0] ?? '',
      };

      // Accumulated across upstream rounds by the internal hooks below, so
      // `finish()` can bill/audit without the caller re-plumbing results.
      let accFinishReason: string | undefined;
      let accUsage: HookUsage | undefined;
      let accError: unknown;
      let finished = false;

      // The operation joins the upstream lifecycle by passing this merged hook
      // set (user hooks + accumulators) and the shared `base` into the model
      // resolvers, so `beforeUpstream`/`afterUpstream`/`afterError` see the
      // operation's requestId + context.
      const hooks = mergeHooks(validated.hooks ?? {}, {
        afterUpstream: [
          (args) => {
            if (typeof args.finishReason === 'string') accFinishReason = args.finishReason;
            if (args.usage) accUsage = addUsage(accUsage, args.usage);
          },
        ],
        afterError: [
          (args) => {
            accError = args.error;
          },
        ],
      });

      return {
        requestId: base.requestId,
        context: base.context,
        start: async () => {
          await runHooks(validated.hooks?.beforeOperation, {
            phase: 'beforeOperation',
            operation: opts.operation,
            requestId: base.requestId,
            startedAt: base.startedAt,
            context: base.context,
            otel: base.otel,
            ...(opts.request && { request: opts.request }),
          });
        },
        finish: async (result) => {
          if (finished) return;
          finished = true;
          await runHooks(
            validated.hooks?.afterOperation,
            {
              phase: 'afterOperation',
              operation: opts.operation,
              requestId: base.requestId,
              startedAt: base.startedAt,
              context: base.context,
              otel: base.otel,
              model: base.model,
              provider: base.provider,
              finishReason: result?.finishReason ?? accFinishReason,
              usage: result?.usage ?? accUsage,
              durationMs: Date.now() - base.startedAt,
              error: result?.error ?? accError,
            },
            { isolate: true },
          );
        },
        chatModel: () => resolvers.chatModel(opts.model, hooks, base),
        embedModel: () => resolvers.embedModel(opts.model, hooks, base),
        imageModel: () => resolvers.imageModel(opts.model, hooks, base),
        videoModel: () => resolvers.videoModel(opts.model, hooks, base),
        speechModel: () => resolvers.speechModel(opts.model, hooks, base),
        transcribeModel: () => resolvers.transcribeModel(opts.model, hooks, base),
        rerankModel: () => resolvers.rerankModel(opts.model, hooks, base),
      };
    },
    registry,
    hooks: deepFreeze({ ...(validated.hooks ?? {}) }),
  };
}
