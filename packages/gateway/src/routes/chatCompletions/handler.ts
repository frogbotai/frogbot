// POST /v1/chat/completions — OpenAI-compatible chat completions route.
//
// Supports both non-streaming (`stream: false`) and streaming (`stream: true`).
//
// Validation happens at the route boundary via `parseChatCompletionRequest`
// (zod). Any structural issue surfaces as a 400 `invalid_request_body` with
// `param` pointing at the exact field. The translator below then only
// throws for semantic rejections it can't express in the schema (invalid
// data URLs, malformed tool-call JSON, unsupported modalities).
//
// The hook lifecycle runs inline (Payload CMS-style): each phase fires at the
// exact point in the handler where it belongs, so the control flow reads
// top-to-bottom with nothing hidden behind a runner abstraction.

import { context as otelContext, type Attributes, type Context as OtelContext } from '@opentelemetry/api';
import { Hono } from 'hono';
import { generateText, streamText, type JSONValue } from 'ai';

import { resolveProvider, type ProviderRegistry } from '../../providers/registry.js';
import {
  toChatOutput,
  toModelMessages,
  toOpenAIResponse,
  type OpenAIMessage,
  type OpenAITool,
} from './translators/index.js';
import { createOpenAIStreamTransform } from './translators/stream.js';
import { toAISDKTools, toAISDKToolChoice } from './translators/tools.js';
import { createSseResponse, toSseStream } from '../../shared/toSseStream.js';
import { toOpenAIErrorResponse, toContentfulStatus } from '../../errors/envelope.js';
import { headersForError } from '../../errors/normalizeAiSdkError.js';
import { isClientAbort } from '../../errors/clientAbort.js';
import { streamErrorFrameToEnvelope } from '../../errors/streamError.js';
import { maybeMaskMessage } from '../../errors/maskMessage.js';
import { toReasoningDetail, type ReasoningDetail } from '../../shared/toReasoningDetail.js';
import { peekStream } from '../../shared/peekStream.js';
import { createStreamLifecycle, type StreamLifecycle } from '../../shared/streamLifecycle.js';
import { isProduction } from '../../shared/runtimeDetection.js';
import { normalizeServiceTier } from '../../shared/normalizeServiceTier.js';
import { createUpstreamSignal, upstreamTimeoutError } from '../../shared/upstreamTimeout.js';

import { parseChatCompletionRequest, type ChatCompletionRequest } from './schema.js';
import { parseJsonBody } from '../../utils/parseJsonBody.js';
import { forwardLanguageParams, forwardMessageProviderOptions, parsePromptCachingOptions } from '../../utils/params.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import { createRepairToolCall } from '../../utils/repairToolCall.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import {
  type GatewayEnv,
  runHooks,
  type HookPhase,
  type HookUsage,
  type Hooks,
  type LanguageParams,
  type OperationBase,
} from '../../hooks.js';
import { getProviderHooks, mergeHooks } from '../../providers/middleware.js';
import { otelContextKey } from '../../observability/tracing.js';
import type { AiSdkTelemetry } from '../../observability/aiSdkTelemetry.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { RequestValidationError } from '../../errors/gatewayError.js';

export type ChatCompletionsRouteContext = {
  registry: ProviderRegistry;
  hooks?: Hooks;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
  telemetry?: AiSdkTelemetry;
};

const operation = 'chat.completions' as const;

export function chatCompletionsRoute(ctx: ChatCompletionsRouteContext) {
  const app = new Hono();

  app.post('/chat/completions', async (c) => {
    const requestId = ensureRequestId(c.req.raw);
    const context = (c.env as GatewayEnv['Bindings'])?.context ?? {};
    const otel: Attributes = {};
    const startedAt = Date.now();

    // Lifecycle state hoisted for `catch`/`finally`. `base` only exists once
    // the provider is resolved; failures before that point rethrow to
    // `app.onError`, which shapes the OpenAI error envelope.
    let base: OperationBase<typeof operation> | undefined;
    let phase: HookPhase = 'beforeOperation';
    let finishReason: string | undefined;
    let usage: HookUsage | undefined;
    let operationError: unknown;
    let hooks: Hooks = ctx.hooks ?? {};
    // Set only for streaming requests — drives `afterOperation`/`afterError`
    // off the stream's real terminal signal instead of HTTP-return time.
    // See `shared/streamLifecycle.ts`.
    let lifecycle: StreamLifecycle | undefined;

    try {
      // `beforeOperation` runs first — a pre-flight gate (auth, rate limit)
      // that fires before the body is parsed or a provider is resolved.
      await runHooks(hooks.beforeOperation, {
        phase,
        operation,
        requestId,
        startedAt,
        context,
        otel,
        request: c.req.raw,
      });

      // Validate the wire-level shape. Any issue is a clean 400 with `param`
      // pointing at the exact field; nothing past this point can produce a
      // `Cannot read properties of undefined` 500.
      const body = parseChatCompletionRequest(await parseJsonBody(c, ctx.maxBodyBytes));
      const resolved = resolveProvider({
        modelId: body.model,
        operation,
        providers: ctx.registry,
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

      // Translate OpenAI wire format → AI SDK format.
      rejectUnsupportedChatParams(body);
      const messages = toModelMessages(body.messages as OpenAIMessage[]);
      const tools = toAISDKTools(body.tools as OpenAITool[] | null | undefined);
      const { toolChoice, activeTools } = toAISDKToolChoice(body.tool_choice);
      const output = toChatOutput(body.response_format);
      const params = buildLanguageParams(body);

      // Parse top-level prompt caching options → providerOptions.unknown
      const cachingOpts = parsePromptCachingOptions(body as Record<string, unknown>);
      const unknownOpts: Record<string, JSONValue> = {
        ...collectPassthroughChatParams(body as Record<string, unknown>),
        ...(cachingOpts ?? {}),
      };
      // Producer for the vendor reasoning-translation chain: stash the raw
      // cross-provider `reasoning_effort` under `unknown` so the provider
      // middleware / forwardLanguageParams can route it to the SDK namespace.
      if (typeof body.reasoning_effort === 'string') {
        unknownOpts.reasoning_effort = body.reasoning_effort;
      }
      const providerOptions: Record<string, Record<string, JSONValue>> = Object.keys(unknownOpts).length > 0
        ? { unknown: unknownOpts }
        : {};
      forwardMessageProviderOptions(messages, resolved.providerName);
      const headers = prepareForwardHeaders(c.req.raw.headers, {
        userAgent: `@frogbotai/gateway/${GATEWAY_PACKAGE_VERSION}`,
      });

      // `beforeUpstream` hooks may mutate `messages`/`params`/`headers`/
      // `providerOptions` in place; `aiOptions` is built afterward so it
      // consumes the mutated values.
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

      // Forward the `unknown` namespace into the SDK provider namespace AFTER
      // hooks run — provider middleware (e.g. bedrock cachePoint) consumes
      // `unknown.cache_control` and must see it before it is drained here.
      forwardLanguageParams(providerOptions, resolved.providerName);

      const upstream = createUpstreamSignal(c.req.raw.signal, ctx.upstreamTimeoutMs);
      const aiOptions = {
        model,
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

      // Run the upstream call with the gateway span's context active so AI SDK
      // inner spans parent under it (stashed by the tracing hook's
      // `beforeUpstream`; falls back to the ambient context when tracing is off).
      const activeContext = (context[otelContextKey] as OtelContext | undefined) ?? otelContext.active();

      phase = 'upstream';

      // --- Streaming path ---
      if (body.stream) {
        const streamLifecycle = createStreamLifecycle({
          base,
          hooks,
          startedAt,
          phase,
        });
        lifecycle = streamLifecycle;
        const result = otelContext.with(activeContext, () =>
          streamText({
            ...aiOptions,
            includeRawChunks: true,
            onFinish: streamLifecycle.onFinish,
            onError: streamLifecycle.onError,
            // A fired server deadline is an upstream fault, not a client abort:
            // skip the 499 abort finalization and let the thrown timeout error
            // drive `afterError`/`afterOperation` instead.
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

      // --- Non-streaming path ---
      // G59: `include.responseBody` defaults to false (ai/src/generate-text/
      // generate-text.ts:549) — opt in so the raw provider body is available
      // for refusal extraction in toOpenAIResponse.
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
        { isolate: true },
      );

      const reasoningDetails = extractReasoningDetails(result.finalStep?.reasoning);

      // Translate AI SDK result → OpenAI response
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
      // afterError is operation-scoped: it only fires once the provider is
      // resolved. Pre-resolution failures (beforeOperation, parse, resolve)
      // rethrow straight to `app.onError`, which shapes the error envelope.
      if (base) {
        await runHooks(
          hooks.afterError,
          { ...base, phase: 'afterError', failedPhase: phase, error: err },
          { isolate: true },
        );
      }
      throw err;
    } finally {
      // `afterOperation` is the guaranteed-fire billing/audit slot. For
      // streaming, the lifecycle owns it and fires once the stream actually
      // concludes — so on the success path the lifecycle is unfinalized here
      // (the stream hasn't drained yet) and `finally` must NOT fire. The one
      // gap is a throw between lifecycle creation and HTTP return (e.g. a
      // pre-first-byte reader rejection in `peekStream`): the lifecycle never
      // finalizes because `toSseStream` was never constructed, `catch` fired
      // `afterError` and rethrew, and nothing fires `afterOperation`. Detect
      // that via `operationError` being set with an unfinalized lifecycle, and
      // fire `afterOperation` directly (not `finalizeNow`, which would re-fire
      // the `afterError` the `catch` already fired).
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
          { isolate: true },
        );
      }
    }
  });

  // Route-specific error handler — produces OpenAI-shaped errors. The handler
  // rethrows (Payload's routeError model), keeping the operation body lean.
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
        providerMetadata: (part as { providerMetadata?: Record<string, Record<string, unknown>> }).providerMetadata,
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
  // `logprobs: false`/null is a spec-valid no-op — accept and drop. Reject only
  // `logprobs: true` until response logprobs plumbing exists (056 review, OC11).
  if (body.logprobs === true) {
    rejectParam(
      'logprobs',
      '`logprobs: true` is not yet supported by this gateway; response logprobs are not implemented. Use `logprobs: false` or omit the field.',
    );
  }
  // Legacy tool-calling API: forwarding these into a provider namespace would
  // not translate to actual tools, so reject-400 and point clients at `tools`.
  if (body.functions !== undefined && body.functions !== null) {
    rejectParam('functions', 'The legacy `functions` parameter is not supported. Use `tools` instead.');
  }
  if (body.function_call !== undefined && body.function_call !== null) {
    rejectParam('function_call', 'The legacy `function_call` parameter is not supported. Use `tool_choice` instead.');
  }
}

/**
 * Fields the handler maps explicitly (or intentionally rejects). Everything
 * NOT in this set is a documented-but-unmapped OpenAI field, which we forward
 * verbatim into `providerOptions.unknown` rather than silently dropping —
 * mirrors hebo-gateway's `convertToTextCallOptions` `...rest` spread.
 * REASSESSMENT_2 §1.4: forward faithfully or reject with a typed 400.
 */
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
  'functions',
  'function_call',
]);

/** Scoop every unmapped, non-null body field into a `providerOptions.unknown` bag. */
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
