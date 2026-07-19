import type {
  EmbeddingModelV4,
  Experimental_VideoModelV4,
  ImageModelV4,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { context as otelContext, type Context as OtelContext } from '@opentelemetry/api';
import { wrapEmbeddingModel, wrapImageModel, wrapLanguageModel } from 'ai';

import {
  runHooks,
  type HookOperation,
  type HookUsage,
  type Hooks,
  type LanguageParams,
  type OperationBase,
} from './hooks.js';
import { otelContextKey } from './observability/tracing.js';
import { getProviderHooks, mergeHooks } from './providers/middleware.js';
import type {
  GatewayEmbeddingModel,
  GatewayLanguageModel,
  GatewayRerankingModel,
  GatewaySpeechModel,
  GatewayTranscriptionModel,
} from './providers/registry.js';
import { forwardLanguageParams, forwardMessageProviderOptions } from './utils/params.js';

type ModelHookOptions = {
  hooks?: Hooks;
  model: string;
  operation: HookOperation;
  provider: string;
  /**
   * Externally-owned operation base (shared requestId/context/otel). When
   * provided, upstream hooks join the caller's operation lifecycle instead of
   * minting a fresh requestId + empty context per call.
   */
  base?: OperationBase;
};

type CallOptions = {
  headers?: Record<string, string | undefined>;
  providerOptions?: Record<string, Record<string, unknown>>;
};

type CallResult = {
  response?: unknown;
  usage?: unknown;
  warnings?: unknown[];
};

function createModelHooks(options: ModelHookOptions) {
  const hooks = mergeHooks(getProviderHooks(options.provider), options.hooks ?? {});
  let base: OperationBase;
  if (options.base) {
    base = options.base;
    base.model = options.model;
    base.provider = options.provider;
  } else {
    base = {
      operation: options.operation,
      requestId: `req_${crypto.randomUUID()}`,
      startedAt: Date.now(),
      context: {},
      otel: {},
      model: options.model,
      provider: options.provider,
    };
  }

  async function beforeUpstream(
    callOptions: CallOptions,
    language?: {
      model: GatewayLanguageModel;
      params: LanguageModelV4CallOptions;
    },
  ): Promise<void> {
    const headers = new Headers();
    for (const [name, value] of Object.entries(callOptions.headers ?? {})) {
      if (value !== undefined) {
        headers.set(name, value);
      }
    }
    const providerOptions = callOptions.providerOptions ?? {};
    callOptions.providerOptions = providerOptions;
    const params: LanguageParams | undefined = language
      ? {
          temperature: language.params.temperature,
          topP: language.params.topP,
          topK: language.params.topK,
          maxOutputTokens: language.params.maxOutputTokens,
          stopSequences: language.params.stopSequences,
          presencePenalty: language.params.presencePenalty,
          frequencyPenalty: language.params.frequencyPenalty,
          seed: language.params.seed,
        }
      : undefined;
    const system =
      language?.params.prompt
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n') || undefined;
    const tools = language?.params.tools
      ? Object.fromEntries(language.params.tools.map((tool) => [tool.name, tool]))
      : undefined;

    try {
      await runHooks(hooks.beforeUpstream, {
        ...base,
        phase: 'beforeUpstream',
        messages: language?.params.prompt,
        system,
        tools,
        params,
        headers,
        providerOptions,
        resolvedModel: language?.model,
      });
    } catch (error) {
      await afterError(error, 'beforeUpstream');
      throw error;
    }

    callOptions.headers = Object.fromEntries(headers);
    if (language && params) {
      Object.assign(language.params, params);
      forwardMessageProviderOptions(language.params.prompt, options.provider);
      forwardLanguageParams(providerOptions, options.provider);
    }
  }

  async function afterUpstream(fields: {
    finishReason?: string;
    response?: unknown;
    usage?: HookUsage;
    warnings?: unknown[];
  }): Promise<void> {
    await runHooks(hooks.afterUpstream, { ...base, phase: 'afterUpstream', ...fields }, { isolate: true });
  }

  async function afterError(error: unknown, failedPhase: 'beforeUpstream' | 'upstream' = 'upstream'): Promise<void> {
    await runHooks(hooks.afterError, { ...base, phase: 'afterError', failedPhase, error }, { isolate: true });
  }

  function run<T>(callback: () => PromiseLike<T>): PromiseLike<T> {
    const active = (base.context[otelContextKey] as OtelContext | undefined) ?? otelContext.active();
    return otelContext.with(active, callback);
  }

  return { afterError, afterUpstream, beforeUpstream, run };
}

function languageUsage(usage: {
  inputTokens: {
    total: number | undefined;
    cacheRead: number | undefined;
    cacheWrite: number | undefined;
  };
  outputTokens: { total: number | undefined; reasoning: number | undefined };
}): HookUsage {
  const inputTokens = usage.inputTokens.total ?? 0;
  const outputTokens = usage.outputTokens.total ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cachedInputTokens: usage.inputTokens.cacheRead,
    cacheWriteTokens: usage.inputTokens.cacheWrite,
    reasoningTokens: usage.outputTokens.reasoning,
  };
}

function directUsage(value: unknown): HookUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const usage = value as {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    tokens?: number;
  };
  if (typeof usage.tokens === 'number') {
    return {
      inputTokens: usage.tokens,
      outputTokens: 0,
      totalTokens: usage.tokens,
    };
  }
  if (
    typeof usage.inputTokens !== 'number' &&
    typeof usage.outputTokens !== 'number' &&
    typeof usage.totalTokens !== 'number'
  )
    return undefined;
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
  };
}

function wrapLanguageStream(args: {
  hooks: ReturnType<typeof createModelHooks>;
  response?: unknown;
  stream: ReadableStream<LanguageModelV4StreamPart>;
}): ReadableStream<LanguageModelV4StreamPart> {
  const reader = args.stream.getReader();
  let finished = false;
  let warnings: unknown[] | undefined;

  return new ReadableStream<LanguageModelV4StreamPart>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          if (!finished) {
            finished = true;
            await args.hooks.afterUpstream({
              response: args.response,
              warnings,
            });
          }
          controller.close();
          return;
        }
        const part = next.value;
        if (part.type === 'stream-start') {
          warnings = part.warnings;
        }
        if (part.type === 'error' && !finished) {
          finished = true;
          await args.hooks.afterError(part.error);
        } else if (part.type === 'finish' && !finished) {
          finished = true;
          await args.hooks.afterUpstream({
            finishReason: part.finishReason.unified,
            response: args.response,
            usage: languageUsage(part.usage),
            warnings,
          });
        }
        controller.enqueue(part);
      } catch (error) {
        if (!finished) {
          finished = true;
          await args.hooks.afterError(error);
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      finished = true;
      await reader.cancel(reason);
    },
  });
}

export function withLanguageModelHooks(model: GatewayLanguageModel, options: ModelHookOptions): LanguageModelV4 {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async ({ doGenerate, params, model: resolvedModel }) => {
        const hooks = createModelHooks(options);
        await hooks.beforeUpstream(params, { model: resolvedModel, params });
        try {
          const result = await hooks.run(doGenerate);
          await hooks.afterUpstream({
            finishReason: result.finishReason.unified,
            response: result.response,
            usage: languageUsage(result.usage),
            warnings: result.warnings,
          });
          return result;
        } catch (error) {
          await hooks.afterError(error);
          throw error;
        }
      },
      wrapStream: async ({ doStream, params, model: resolvedModel }) => {
        const hooks = createModelHooks(options);
        await hooks.beforeUpstream(params, { model: resolvedModel, params });
        try {
          const result = await hooks.run(doStream);
          return {
            ...result,
            stream: wrapLanguageStream({
              hooks,
              response: result.response,
              stream: result.stream,
            }),
          };
        } catch (error) {
          await hooks.afterError(error);
          throw error;
        }
      },
    },
  });
}

export function withEmbeddingModelHooks(model: GatewayEmbeddingModel, options: ModelHookOptions): EmbeddingModelV4 {
  return wrapEmbeddingModel({
    model,
    middleware: {
      specificationVersion: 'v4',
      wrapEmbed: async ({ doEmbed, params }) => {
        const hooks = createModelHooks(options);
        await hooks.beforeUpstream(params);
        try {
          const result = await hooks.run(doEmbed);
          await hooks.afterUpstream({
            response: result.response,
            usage: directUsage(result.usage),
            warnings: result.warnings,
          });
          return result;
        } catch (error) {
          await hooks.afterError(error);
          throw error;
        }
      },
    },
  });
}

export function withImageModelHooks(model: ImageModelV4, options: ModelHookOptions): ImageModelV4 {
  return wrapImageModel({
    model,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async ({ doGenerate, params }) => {
        const hooks = createModelHooks(options);
        await hooks.beforeUpstream(params);
        try {
          const result = await hooks.run(doGenerate);
          await hooks.afterUpstream({
            response: result.response,
            usage: directUsage(result.usage),
            warnings: result.warnings,
          });
          return result;
        } catch (error) {
          await hooks.afterError(error);
          throw error;
        }
      },
    },
  });
}

function withMethodHooks<T extends object>(args: {
  method: 'doGenerate' | 'doRerank';
  model: T;
  options: ModelHookOptions;
}): T {
  return new Proxy(args.model, {
    get(target, property, receiver) {
      if (property !== args.method) return Reflect.get(target, property, receiver);
      return async (callOptions: CallOptions) => {
        const hooks = createModelHooks(args.options);
        await hooks.beforeUpstream(callOptions);
        try {
          const method = Reflect.get(target, property, target) as (options: CallOptions) => PromiseLike<CallResult>;
          const result = await hooks.run(() => method.call(target, callOptions));
          await hooks.afterUpstream({
            response: result.response,
            usage: directUsage(result.usage),
            warnings: result.warnings,
          });
          return result;
        } catch (error) {
          await hooks.afterError(error);
          throw error;
        }
      };
    },
  });
}

export const withVideoModelHooks = (
  model: Experimental_VideoModelV4,
  options: ModelHookOptions,
): Experimental_VideoModelV4 => withMethodHooks({ method: 'doGenerate', model, options });

export const withSpeechModelHooks = (model: GatewaySpeechModel, options: ModelHookOptions): GatewaySpeechModel =>
  withMethodHooks({ method: 'doGenerate', model, options });

export const withTranscriptionModelHooks = (
  model: GatewayTranscriptionModel,
  options: ModelHookOptions,
): GatewayTranscriptionModel => withMethodHooks({ method: 'doGenerate', model, options });

export const withRerankingModelHooks = (
  model: GatewayRerankingModel,
  options: ModelHookOptions,
): GatewayRerankingModel => withMethodHooks({ method: 'doRerank', model, options });
