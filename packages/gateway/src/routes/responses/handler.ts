import {
  type Attributes,
  type Context as OtelContext,
  context as otelContext,
} from '@opentelemetry/api';
import { generateText, type JSONValue, streamText } from 'ai';
import { Hono } from 'hono';

import { isClientAbort } from '../../errors/clientAbort.js';
import { toContentfulStatus, toOpenAIErrorResponse } from '../../errors/envelope.js';
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
import { peekStream } from '../../shared/peekStream.js';
import { isProduction } from '../../shared/runtimeDetection.js';
import { createStreamLifecycle, type StreamLifecycle } from '../../shared/streamLifecycle.js';
import { withStrictOutput } from '../../shared/strictOutput.js';
import { createSseResponse, toSseStream } from '../../shared/toSseStream.js';
import { createUpstreamSignal, upstreamTimeoutError } from '../../shared/upstreamTimeout.js';
import { guardedDownload } from '../../utils/downloadGuard.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import { parseJsonBody } from '../../utils/parseJsonBody.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import { withInstructionsCache } from './instructionsCache.js';
import { parseResponsesRequest, type ResponsesRequest } from './schema.js';
import {
  createResponsesStreamTransform,
  isStrictResponsesOutput,
  toModelMessages,
  toResponsesOutput,
  toResponsesResponse,
  toResponsesToolChoice,
  toResponsesTools,
} from './translators/index.js';

export type ResponsesRouteContext = ProviderModelPolicy & {
  registry: ProviderRegistry;
  hooks?: Hooks;
  /** Host logger; defaults to the console logger. */
  logger?: GatewayLogger;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
  telemetry?: AiSdkTelemetry;
};

const operation = 'responses' as const;

export function responsesRoute(ctx: ResponsesRouteContext) {
  const app = new Hono();
  const logger = resolveLogger(ctx.logger);

  app.post('/responses', async (c) => {
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

      const body = parseResponsesRequest(await parseJsonBody(c, ctx.maxBodyBytes));
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

      const messages = toModelMessages(body.input);
      const tools = toResponsesTools(body.tools, resolved.providerName);
      const toolChoice = toResponsesToolChoice(body.tool_choice);
      const output = toResponsesOutput(body.text);
      const instructions = withInstructionsCache(
        body.instructions ?? undefined,
        resolved.providerName,
        resolved.modelName,
      );

      const { params, providerOptions } = forwardResponseParams(body, resolved.providerName);
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

      delete providerOptions.unknown;

      const upstream = createUpstreamSignal(c.req.raw.signal, ctx.upstreamTimeoutMs);
      const aiOptions = {
        model: isStrictResponsesOutput(body.text) ? withStrictOutput(model) : model,
        messages,
        ...(instructions ? { instructions } : {}),
        allowSystemInMessages: true,
        tools,
        toolChoice,
        ...(output ? { output } : {}),
        providerOptions,
        ...params,
        abortSignal: upstream.signal,
        headers: Object.fromEntries(headers),
        experimental_download: guardedDownload,
        telemetry: ctx.telemetry?.forRequest(context),
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
        { isolate: true, logger },
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
  } else if (body.reasoning?.effort != null) {
    providerOptions.unknown = { reasoning_effort: body.reasoning.effort };
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
