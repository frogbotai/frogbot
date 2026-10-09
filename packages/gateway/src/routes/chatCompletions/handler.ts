import {
  type Attributes,
  type Context as OtelContext,
  context as otelContext,
} from '@opentelemetry/api';
import { generateText, type JSONValue, streamText } from 'ai';
import { Hono } from 'hono';

import { isClientAbort } from '../../errors/clientAbort.js';
import { toContentfulStatus, toOpenAIErrorResponse } from '../../errors/envelope.js';
import { RequestValidationError } from '../../errors/gatewayError.js';
import { maybeMaskMessage } from '../../errors/maskMessage.js';
import { headersForError } from '../../errors/normalizeAiSdkError.js';
import { streamErrorFrameToEnvelope } from '../../errors/streamError.js';
import {
  type GatewayEnv,
  type HookPhase,
  type Hooks,
  type HookUsage,
  type LanguageParams,
  type OperationBase,
  runHooks,
} from '../../hooks.js';
import type { AiSdkTelemetry } from '../../observability/aiSdkTelemetry.js';
import { type GatewayLogger, resolveLogger } from '../../observability/logger.js';
import { otelContextKey } from '../../observability/tracing.js';
import { getProviderHooks, mergeHooks } from '../../providers/middleware.js';
import {
  type ProviderModelPolicy,
  type ProviderRegistry,
  resolveProvider,
} from '../../providers/registry.js';
import { isVertexAnthropicModel } from '../../providers/vertex/models.js';
import { normalizeServiceTier } from '../../shared/normalizeServiceTier.js';
import { peekStream } from '../../shared/peekStream.js';
import { isProduction } from '../../shared/runtimeDetection.js';
import { createStreamLifecycle, type StreamLifecycle } from '../../shared/streamLifecycle.js';
import { withStrictOutput } from '../../shared/strictOutput.js';
import { type ReasoningDetail, toReasoningDetail } from '../../shared/toReasoningDetail.js';
import { createSseResponse, toSseStream } from '../../shared/toSseStream.js';
import { createUpstreamSignal, upstreamTimeoutError } from '../../shared/upstreamTimeout.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import {
  forwardLanguageParams,
  forwardMessageProviderOptions,
  parsePromptCachingOptions,
} from '../../utils/params.js';
import { parseJsonBody } from '../../utils/parseJsonBody.js';
import { createRepairToolCall } from '../../utils/repairToolCall.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import { type ChatCompletionRequest, parseChatCompletionRequest } from './schema.js';
import {
  isStrictChatOutput,
  type OpenAITool,
  toChatOutput,
  toModelMessages,
  toOpenAIResponse,
} from './translators/index.js';
import { createOpenAIStreamTransform } from './translators/stream.js';
import { toAISDKToolChoice, toAISDKTools } from './translators/tools.js';

export type ChatCompletionsRouteContext = ProviderModelPolicy & {
  registry: ProviderRegistry;
  hooks?: Hooks;
  /** Host logger; defaults to the console logger. */
  logger?: GatewayLogger;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
  telemetry?: AiSdkTelemetry;
};

const operation = 'chat.completions' as const;

export function chatCompletionsRoute(ctx: ChatCompletionsRouteContext) {
  const app = new Hono();
  const logger = resolveLogger(ctx.logger);

  app.post('/chat/completions', async (c) => {
    const requestId = ensureRequestId(c.req.raw);
    const context = (c.env as GatewayEnv['Bindings'])?.context ?? {};
    const otel: Attributes = {};
    const startedAt = Date.now();

    let base: OperationBase<typeof operation> | undefined;
    let phase: HookPhase = 'beforeOperation';
    let finishReason: string | undefined;
    let usage: HookUsage | undefined;
    let operationError: unknown;
    let hooks: Hooks = ctx.hooks ?? {};
    let lifecycle: StreamLifecycle | undefined;

    try {
      await runHooks(hooks.beforeOperation, {
        phase,
        operation,
        requestId,
        startedAt,
        context,
        otel,
        request: c.req.raw,
      });

      const body = parseChatCompletionRequest(await parseJsonBody(c, ctx.maxBodyBytes));
      const resolved = resolveProvider({
        modelId: body.model,
        operation,
        providers: ctx.registry,
        models: ctx.models,
        allowlists: ctx.allowlists,
      });

      const model = resolved.instance.languageModel(resolved.modelName);
      hooks = mergeHooks(getProviderHooks(resolved.providerName), ctx.hooks ?? {});

      base = {
        operation,
        requestId,
        startedAt,
        context,
        otel,
        model: body.model,
        provider: resolved.providerName,
      };

      phase = 'beforeUpstream';

      rejectUnsupportedChatParams(body);
      const messages = toModelMessages(body.messages, logger);
      const tools = toAISDKTools(body.tools as OpenAITool[] | null | undefined);
      const { toolChoice, activeTools } = toAISDKToolChoice(body.tool_choice);
      const output = toChatOutput(body.response_format);
      const params = buildLanguageParams(body);

      const cachingOpts = parsePromptCachingOptions(body as Record<string, unknown>);
      if (
        cachingOpts?.prompt_cache_key &&
        !cachingOpts.cached_content &&
        (resolved.providerName === 'google' ||
          (resolved.providerName === 'vertex' && !isVertexAnthropicModel(body.model)))
      ) {
        cachingOpts.cached_content = cachingOpts.prompt_cache_key;
      }

      const unknownOpts: Record<string, JSONValue> = {
        ...collectPassthroughChatParams(body),
        ...(cachingOpts ?? {}),
      };

      if (typeof body.reasoning_effort === 'string') {
        unknownOpts.reasoning_effort = body.reasoning_effort;
      }

      const providerOptions: Record<string, Record<string, JSONValue>> = Object.keys(unknownOpts)
        .length > 0
        ? { unknown: unknownOpts }
        : {};

      const headers = prepareForwardHeaders(c.req.raw.headers, {
        userAgent: `@frogbotai/gateway/${GATEWAY_PACKAGE_VERSION}`,
      });

      await runHooks(hooks.beforeUpstream, {
        ...base,
        phase,
        messages,
        tools,
        params,
        headers,
        providerOptions,
        resolvedModel: model,
      });

      forwardMessageProviderOptions(messages, resolved.providerName);
      forwardLanguageParams(providerOptions, resolved.providerName);

      const upstream = createUpstreamSignal(c.req.raw.signal, ctx.upstreamTimeoutMs);
      const aiOptions = {
        model: isStrictChatOutput(body.response_format) ? withStrictOutput(model) : model,
        messages,
        allowSystemInMessages: true,
        tools,
        toolChoice,
        activeTools,
        output,
        providerOptions,
        abortSignal: upstream.signal,
        headers: Object.fromEntries(headers),
        experimental_repairToolCall: createRepairToolCall(),
        telemetry: ctx.telemetry?.forRequest(context),
        ...params,
      };

      const activeContext =
        (context[otelContextKey] as OtelContext | undefined) ?? otelContext.active();

      phase = 'upstream';

      if (body.stream) {
        const streamLifecycle = createStreamLifecycle({
          base,
          hooks,
          startedAt,
          phase,
          logger,
        });

        lifecycle = streamLifecycle;
        const result = otelContext.with(activeContext, () =>
          streamText({
            ...aiOptions,
            includeRawChunks: true,
            onFinish: streamLifecycle.onFinish,
            onError: streamLifecycle.onError,
            onAbort: async () => {
              if (upstream.timedOut()) return;
              await streamLifecycle.onAbort();
            },
          }),
        );

        const sseStream = result.fullStream.pipeThrough(
          createOpenAIStreamTransform({
            model: body.model,
            requestId,
            production: isProduction(),
            includeUsage: body.stream_options?.include_usage === true,
          }),
        );

        const peeked = await peekStream(sseStream);
        if (!peeked) {
          if (upstream.timedOut()) {
            throw upstreamTimeoutError();
          }

          return createSseResponse(
            toSseStream(new ReadableStream<string>(), {
              appendDone: true,
              onDone: lifecycle.onStreamDone,
            }),
            { requestId },
          );
        }

        const firstError = firstOpenAIStreamErrorEnvelope(peeked.first);
        if (firstError) {
          await lifecycle.finalizeNow();

          return Response.json(
            {
              error: {
                ...firstError.body.error,
                message: maybeMaskMessage(firstError.body.error.message, {
                  status: firstError.status,
                  requestId,
                  production: isProduction(),
                }),
              },
            },
            {
              status: firstError.status,
              headers: {
                'x-request-id': requestId,
                ...headersForError(undefined, firstError.status),
              },
            },
          );
        }

        finishReason = 'streaming';

        return createSseResponse(
          toSseStream(peeked.stream, {
            appendDone: true,
            toError: (err) => [
              {
                kind: 'data',
                data: toOpenAIErrorResponse(err, { requestId }).body,
              },
            ],
            onDone: lifecycle.onStreamDone,
          }),
          { requestId },
        );
      }

      const result = await otelContext.with(activeContext, () =>
        generateText({
          ...aiOptions,
          include: { responseBody: true },
        }),
      );

      finishReason = result.finishReason;

      usage = {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
        cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens,
        cacheWriteTokens: result.usage.inputTokenDetails?.cacheWriteTokens,
        reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens,
      };

      phase = 'afterUpstream';

      await runHooks(
        hooks.afterUpstream,
        {
          ...base,
          phase,
          finishReason,
          usage,
          response: result.response,
          warnings: result.warnings,
        },
        { isolate: true, logger },
      );

      const reasoningDetails = extractReasoningDetails(result.finalStep?.reasoning);

      const response = toOpenAIResponse({
        text: result.text,
        finishReason: result.finishReason,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
          inputTokenDetails: result.usage.inputTokenDetails,
          outputTokenDetails: result.usage.outputTokenDetails,
        },
        response: result.response,
        toolCalls: result.toolCalls.map((tc) => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.input,
        })),
        reasoningDetails: reasoningDetails.length > 0 ? reasoningDetails : undefined,
        reasoningContent: result.reasoningText || undefined,
        serviceTier: normalizeServiceTier(result.providerMetadata),
        model: body.model,
      });

      return c.json(response);
    } catch (err) {
      operationError = err;
      if (base) {
        await runHooks(
          hooks.afterError,
          { ...base, phase: 'afterError', failedPhase: phase, error: err },
          { isolate: true, logger },
        );
      }

      throw err;
    } finally {
      const streamThrewBeforeFinalize =
        lifecycle !== undefined && operationError !== undefined && !lifecycle.hasFinalized();

      if (base && (!lifecycle || streamThrewBeforeFinalize)) {
        await runHooks(
          hooks.afterOperation,
          {
            ...base,
            phase: 'afterOperation',
            finishReason,
            usage,
            durationMs: Date.now() - startedAt,
            error: operationError,
          },
          { isolate: true, logger },
        );
      }
    }
  });

  app.onError((err, c) => {
    if (isClientAbort(err, c.req.raw.signal)) {
      return new Response(null, { status: 499 });
    }

    const requestId = ensureRequestId(c.req.raw);
    c.header('x-request-id', requestId);
    const { body, status } = toOpenAIErrorResponse(err, { requestId });

    for (const [k, v] of Object.entries(headersForError(err, status))) {
      c.header(k, v);
    }

    return c.json(body, toContentfulStatus(status));
  });

  return app;
}

export function buildLanguageParams(body: ChatCompletionRequest): LanguageParams {
  return {
    temperature: body.temperature ?? undefined,
    topP: body.top_p ?? undefined,
    topK: body.top_k ?? undefined,
    maxOutputTokens: body.max_completion_tokens ?? body.max_tokens ?? undefined,
    stopSequences: body.stop ? (Array.isArray(body.stop) ? body.stop : [body.stop]) : undefined,
    presencePenalty: body.presence_penalty ?? undefined,
    frequencyPenalty: body.frequency_penalty ?? undefined,
    seed: body.seed ?? undefined,
  };
}

/** Extracts cross-provider reasoning details from the final step, if present. */
export function extractReasoningDetails(
  reasoning: Array<{ type: string; text?: string }> | undefined,
): ReasoningDetail[] {
  const details: ReasoningDetail[] = [];

  for (const part of reasoning ?? []) {
    if (part.type !== 'reasoning' || typeof part.text !== 'string') {
      continue;
    }

    details.push(
      toReasoningDetail({
        text: part.text,
        providerMetadata: (part as { providerMetadata?: Record<string, Record<string, unknown>> })
          .providerMetadata,
        id: `reasoning-${crypto.randomUUID()}`,
        index: details.length,
      }),
    );
  }

  return details;
}

function rejectUnsupportedChatParams(body: Record<string, unknown>) {
  if (typeof body.n === 'number' && body.n > 1) {
    rejectParam('n', '`n > 1` is not supported by this gateway.');
  }

  if (body.logit_bias !== undefined && body.logit_bias !== null) {
    rejectParam('logit_bias', '`logit_bias` is not supported by this gateway.');
  }

  if (body.logprobs === true) {
    rejectParam(
      'logprobs',
      '`logprobs: true` is not yet supported by this gateway; response logprobs are not implemented. Use `logprobs: false` or omit the field.',
    );
  }

  if (body.functions !== undefined && body.functions !== null) {
    rejectParam(
      'functions',
      'The legacy `functions` parameter is not supported. Use `tools` instead.',
    );
  }

  if (body.function_call !== undefined && body.function_call !== null) {
    rejectParam(
      'function_call',
      'The legacy `function_call` parameter is not supported. Use `tool_choice` instead.',
    );
  }
}

const HANDLED_CHAT_PARAMS = new Set<string>([
  'model',
  'messages',
  'stream',
  'stream_options',
  'tools',
  'tool_choice',
  'temperature',
  'top_p',
  'top_k',
  'max_tokens',
  'max_completion_tokens',
  'stop',
  'presence_penalty',
  'frequency_penalty',
  'seed',
  'n',
  'logit_bias',
  'logprobs',
  'response_format',
  'reasoning_effort',
  'prompt_cache_key',
  'prompt_cache_retention',
  'cache_control',
  'cached_content',
  'functions',
  'function_call',
]);

function collectPassthroughChatParams(body: Record<string, unknown>): Record<string, JSONValue> {
  const rest: Record<string, JSONValue> = {};

  for (const [key, value] of Object.entries(body)) {
    if (HANDLED_CHAT_PARAMS.has(key) || value === undefined || value === null) {
      continue;
    }

    rest[key] = value as JSONValue;
  }

  return rest;
}

function rejectParam(param: string, message: string): never {
  throw new RequestValidationError({ message, param });
}

function firstOpenAIStreamErrorEnvelope(chunk: string) {
  for (const match of chunk.matchAll(/^data: (.+)$/gm)) {
    const data = match[1];
    if (!data || data === '[DONE]') {
      continue;
    }

    const envelope = streamErrorFrameToEnvelope(data);
    if (envelope) return envelope;
  }

  return undefined;
}
