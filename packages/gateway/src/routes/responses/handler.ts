// POST /v1/responses — OpenAI Responses API-compatible route.
//
// Supports both non-streaming (default) and streaming (`stream: true`).
//
// The hook lifecycle runs inline (Payload CMS-style): each phase fires at the
// exact point in the handler where it belongs, so the control flow reads
// top-to-bottom with nothing hidden behind a runner abstraction.

import { context as otelContext, type Attributes, type Context as OtelContext } from '@opentelemetry/api';
import { generateText, streamText, type JSONValue } from 'ai';
import { Hono } from 'hono';

import { isClientAbort } from '../../errors/clientAbort.js';
import { toOpenAIErrorResponse, toContentfulStatus } from '../../errors/envelope.js';
import { maybeMaskMessage } from '../../errors/maskMessage.js';
import { headersForError } from '../../errors/normalizeAiSdkError.js';
import { streamErrorFrameToEnvelope } from '../../errors/streamError.js';
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
import { resolveProvider, type ProviderRegistry } from '../../providers/registry.js';
import { peekStream } from '../../shared/peekStream.js';
import { isProduction } from '../../shared/runtimeDetection.js';
import { createStreamLifecycle, type StreamLifecycle } from '../../shared/streamLifecycle.js';
import { createUpstreamSignal, upstreamTimeoutError } from '../../shared/upstreamTimeout.js';
import { createSseResponse, toSseStream } from '../../shared/toSseStream.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import { guardedDownload } from '../../utils/downloadGuard.js';
import { parseJsonBody } from '../../utils/parseJsonBody.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import { parseResponsesRequest, type ResponsesRequest } from './schema.js';
import {
  createResponsesStreamTransform,
  toModelMessages,
  toResponsesOutput,
  toResponsesResponse,
  toResponsesToolChoice,
  toResponsesTools,
} from './translators/index.js';

export type ResponsesRouteContext = {
  registry: ProviderRegistry;
  hooks?: Hooks;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
  telemetry?: AiSdkTelemetry;
};

const operation = 'responses' as const;

export function responsesRoute(ctx: ResponsesRouteContext) {
  const app = new Hono();

  app.post('/responses', async (c) => {
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

      const body = parseResponsesRequest(await parseJsonBody(c, ctx.maxBodyBytes));
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

      // Translate OpenAI Responses wire format → AI SDK format.
      const messages = toModelMessages(body.input);
      const tools = toResponsesTools(body.tools, resolved.providerName);
      const toolChoice = toResponsesToolChoice(body.tool_choice);
      const output = toResponsesOutput(body.text);
      const instructions = body.instructions ?? undefined;
      const { params, providerOptions } = forwardResponseParams(body, resolved.providerName);
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

      const upstream = createUpstreamSignal(c.req.raw.signal, ctx.upstreamTimeoutMs);
      const aiOptions = {
        model,
        messages,
        // `instructions` maps to the Responses `instructions` field; passed as
        // a top-level AI SDK option (system messages in `messages` are rejected
        // by the Responses model). `allowSystemInMessages` tolerates any
        // system/developer turns carried in the input array.
        ...(instructions ? { instructions } : {}),
        allowSystemInMessages: true,
        tools,
        toolChoice,
        ...(output ? { output } : {}),
        providerOptions,
        ...params,
        abortSignal: upstream.signal,
        headers: Object.fromEntries(headers),
        // SSRF guard (G33): user-supplied media URLs the provider can't fetch
        // natively would otherwise be downloaded in-process by the SDK default.
        experimental_download: guardedDownload,
        telemetry: ctx.telemetry?.forRequest(context),
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
          createResponsesStreamTransform({
            model: body.model,
            previousResponseId: body.previous_response_id,
            body,
            requestId,
            production: isProduction(),
          }),
        );
        const peeked = await peekStream(sseStream);
        if (!peeked && upstream.timedOut()) {
          throw upstreamTimeoutError();
        }
        const firstError = peeked ? firstResponsesStreamErrorEnvelope(peeked.first) : undefined;
        if (firstError) {
          finishReason = 'error';
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
          toSseStream(peeked?.stream ?? new ReadableStream<string>(), {
            appendDone: false,
            // Post-peek catastrophic errors must be framed as a spec-compliant
            // Responses `error` event (nested `data.error`, matching the
            // in-stream `error` part shape), never a bare `data:` frame with no
            // `event:` line.
            toError: (err) => [
              {
                kind: 'event',
                event: 'error',
                data: {
                  type: 'error',
                  error: toOpenAIErrorResponse(err, { requestId }).body.error,
                },
              },
            ],
            onDone: lifecycle.onStreamDone,
          }),
          { requestId },
        );
      }

      // --- Non-streaming path ---
      const result = await otelContext.with(activeContext, () => generateText(aiOptions));
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

      return c.json(
        toResponsesResponse({
          result: {
            text: result.text,
            content: result.content,
            toolCalls: result.toolCalls.map((tc) => ({
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.input,
            })),
            finishReason: result.finishReason,
            response: result.response,
            usage: result.usage,
            providerMetadata: result.providerMetadata,
          },
          model: body.model,
          previousResponseId: body.previous_response_id,
          body,
        }),
      );
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

function buildOpenAIResponseOptions(body: ResponsesRequest): Record<string, JSONValue> {
  const options: Record<string, JSONValue> = {};
  if (body.previous_response_id != null) {
    options.previousResponseId = body.previous_response_id;
  }
  if (body.user != null) {
    options.user = body.user;
  }
  if (body.metadata != null) {
    options.metadata = body.metadata as JSONValue;
  }
  if (body.store != null) {
    options.store = body.store;
  }
  if (body.parallel_tool_calls != null) {
    options.parallelToolCalls = body.parallel_tool_calls;
  }
  if (body.truncation != null) {
    options.truncation = body.truncation;
  }
  if (body.service_tier != null) {
    options.serviceTier = body.service_tier;
  }
  if (body.include != null) {
    options.include = body.include;
  }
  if (body.prompt_cache_key != null) {
    options.promptCacheKey = body.prompt_cache_key;
  }
  if (body.prompt_cache_retention != null) {
    options.promptCacheRetention = body.prompt_cache_retention;
  }
  if (body.safety_identifier != null) {
    options.safetyIdentifier = body.safety_identifier;
  }
  if (body.max_tool_calls != null) {
    options.maxToolCalls = body.max_tool_calls;
  }
  if (body.reasoning?.effort != null) {
    options.reasoningEffort = body.reasoning.effort;
  }
  if (body.reasoning?.summary != null) {
    options.reasoningSummary = body.reasoning.summary;
  }
  if (body.text?.verbosity != null) {
    options.textVerbosity = body.text.verbosity;
  }
  if (body.text?.format?.strict != null) {
    options.strictJsonSchema = body.text.format.strict;
  }
  return options;
}

// Splits Responses wire params into cross-provider language params (spread as
// top-level `generateText`/`streamText` options) and OpenAI-only
// `providerOptions.openai` params (only when the provider is OpenAI and only
// when non-empty). Mirrors the chat route's `buildLanguageParams` factoring
// and hebo's `convertToTextCallOptions`.
export function forwardResponseParams(
  body: ResponsesRequest,
  providerName: string,
): {
  params: LanguageParams;
  providerOptions: Record<string, Record<string, JSONValue>>;
} {
  const params: LanguageParams = {
    temperature: body.temperature ?? undefined,
    topP: body.top_p ?? undefined,
    topK: body.top_k ?? undefined,
    maxOutputTokens: body.max_output_tokens ?? undefined,
    stopSequences: body.stop ? (Array.isArray(body.stop) ? body.stop : [body.stop]) : undefined,
    presencePenalty: body.presence_penalty ?? undefined,
    frequencyPenalty: body.frequency_penalty ?? undefined,
    seed: body.seed ?? undefined,
  };

  const providerOptions: Record<string, Record<string, JSONValue>> = {};
  if (providerName === 'openai') {
    const openaiOptions = buildOpenAIResponseOptions(body);
    if (Object.keys(openaiOptions).length > 0) {
      providerOptions.openai = openaiOptions;
    }
  }

  return { params, providerOptions };
}

function firstResponsesStreamErrorEnvelope(chunk: string) {
  for (const match of chunk.matchAll(/^data: (.+)$/gm)) {
    const data = match[1];
    if (!data) {
      continue;
    }
    try {
      const envelope = streamErrorFrameToEnvelope(JSON.parse(data));
      if (envelope) return envelope;
    } catch {
      continue;
    }
  }
  return undefined;
}
