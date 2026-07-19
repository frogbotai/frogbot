// POST /v1/messages — Anthropic-compatible messages route.
//
// Supports both non-streaming (`stream: false`) and streaming (`stream: true`).
//
// Validation happens at the route boundary via `parseMessagesRequest` (zod).
// The translator then maps the Anthropic wire format to AI SDK ModelMessage[]
// and maps the AI SDK result back to the Anthropic response envelope.
//
// The hook lifecycle runs inline (Payload CMS-style): each phase fires at the
// exact point in the handler where it belongs, so the control flow reads
// top-to-bottom with nothing hidden behind a runner abstraction.

import { context as otelContext, type Attributes, type Context as OtelContext } from '@opentelemetry/api';
import { Hono } from 'hono';
import { generateText, streamText, jsonSchema, Output, type JSONValue } from 'ai';

import { resolveProvider, type ProviderRegistry } from '../../providers/registry.js';
import {
  toModelMessages,
  toAnthropicResponse,
  createAnthropicStreamTransform,
  extractThinkingTokens,
  extractCacheCreation,
} from './translators/index.js';
import { toAISDKTools, toAISDKToolChoice } from './translators/tools.js';
import { createSseResponse, toSseStream } from '../../shared/toSseStream.js';
import { toAnthropicErrorResponse, toContentfulStatus } from '../../errors/envelope.js';
import { statusForAnthropicErrorType } from '../../errors/statusMaps.js';
import { headersForError } from '../../errors/normalizeAiSdkError.js';
import { isClientAbort } from '../../errors/clientAbort.js';
import { maybeMaskMessage } from '../../errors/maskMessage.js';
import { toAnthropicReasoning } from '../../shared/toAnthropicReasoning.js';
import { createStreamLifecycle, type StreamLifecycle } from '../../shared/streamLifecycle.js';
import { isProduction } from '../../shared/runtimeDetection.js';
import { createUpstreamSignal, upstreamTimeoutError } from '../../shared/upstreamTimeout.js';

import { parseMessagesRequest, type MessagesRequest } from './schema.js';
import { parseJsonBody } from '../../utils/parseJsonBody.js';
import { guardedDownload } from '../../utils/downloadGuard.js';
import { forwardLanguageParams, forwardMessageProviderOptions, parsePromptCachingOptions } from '../../utils/params.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import { runHooks, type GatewayEnv, type HookPhase, type HookUsage, type Hooks, type OperationBase } from '../../hooks.js';
import { getProviderHooks, mergeHooks } from '../../providers/middleware.js';
import { otelContextKey } from '../../observability/tracing.js';
import type { AiSdkTelemetry } from '../../observability/aiSdkTelemetry.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { RequestValidationError } from '../../errors/gatewayError.js';

import type { AnthropicMessage, AnthropicSystemParam } from './translators/index.js';

export type MessagesRouteContext = {
  registry: ProviderRegistry;
  hooks?: Hooks;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
  telemetry?: AiSdkTelemetry;
};

const operation = 'messages' as const;

export function messagesRoute(ctx: MessagesRouteContext) {
  const app = new Hono();

  app.post('/messages', async (c) => {
    const requestId = ensureRequestId(c.req.raw);
    const context = (c.env as GatewayEnv['Bindings'])?.context ?? {};
    const otel: Attributes = {};
    const startedAt = Date.now();

    // Lifecycle state hoisted for `catch`/`finally`. `base` only exists once
    // the provider is resolved; failures before that point rethrow to
    // `app.onError`, which shapes the Anthropic error envelope.
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

      const body = parseMessagesRequest(await parseJsonBody(c, ctx.maxBodyBytes));
      const resolved = resolveProvider({
        modelId: body.model,
        operation: 'chat.completions',
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

      // Translate Anthropic messages → AI SDK format.
      rejectUnsupportedMessagesParams(body);
      const messages = toModelMessages({
        messages: body.messages as AnthropicMessage[],
        system: body.system as AnthropicSystemParam | undefined,
      });
      forwardMessageProviderOptions(messages, resolved.providerName);
      const headers = prepareForwardHeaders(c.req.raw.headers, {
        userAgent: `@frogbotai/gateway/${GATEWAY_PACKAGE_VERSION}`,
      });

      // Convert Anthropic tools → AI SDK tools.
      const tools = toAISDKTools(body.tools);
      const toolChoice = toAISDKToolChoice(body.tool_choice);
      const providerOptions: Record<string, Record<string, JSONValue>> = {};
      applyThinking(providerOptions, body.thinking);
      applyToolChoiceOptions(providerOptions, body.tool_choice);
      applyMcpServers(providerOptions, body.mcp_servers);
      applyContainer(providerOptions, body.container);
      if (body.service_tier) {
        providerOptions.unknown = {
          ...providerOptions.unknown,
          service_tier: body.service_tier,
        };
      }
      // Top-level cache_control ("cache the last cacheable block") →
      // providerOptions.unknown.cache_control; forwardLanguageParams re-homes
      // it to the SDK namespace (anthropic.cacheControl) after hooks run.
      const cachingOpts = parsePromptCachingOptions({
        cache_control: body.cache_control,
      });
      if (cachingOpts) {
        providerOptions.unknown = {
          ...providerOptions.unknown,
          ...cachingOpts,
        };
      }
      const params = {
        temperature: body.temperature ?? undefined,
        topP: body.top_p ?? undefined,
        topK: body.top_k ?? undefined,
        maxOutputTokens: body.max_tokens,
        stopSequences: body.stop_sequences ?? undefined,
      };

      // Structured output: `output_config.format` (GA) with the deprecated
      // top-level `output_format` as a fallback. `json_schema` → Output.object,
      // which the anthropic provider renders back into `output_config.format`.
      const outputConfig = body.output_config ?? (body.output_format ? { format: body.output_format } : undefined);
      const outputFormat = outputConfig?.format;
      const output =
        outputFormat?.type === 'json_schema' ? Output.object({ schema: jsonSchema(outputFormat.schema) }) : undefined;

      // `beforeUpstream` hooks may mutate `messages`/`params`/`headers`/
      // `providerOptions` in place; `aiOptions` is built afterward so it
      // consumes the mutated values.
      await runHooks(hooks.beforeUpstream, {
        ...base,
        phase,
        messages,
        system: body.system ?? undefined,
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

      // Shared AI SDK options.
      const upstream = createUpstreamSignal(c.req.raw.signal, ctx.upstreamTimeoutMs);
      const aiOptions = {
        model,
        messages,
        allowSystemInMessages: true,
        tools,
        toolChoice,
        providerOptions,
        abortSignal: upstream.signal,
        headers: Object.fromEntries(headers),
        // SSRF guard (G33): user-supplied media URLs the provider can't fetch
        // natively would otherwise be downloaded in-process by the SDK default.
        experimental_download: guardedDownload,
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
        maxOutputTokens: params.maxOutputTokens,
        stopSequences: params.stopSequences,
        telemetry: ctx.telemetry?.forRequest(context),
        ...(output ? { output } : {}),
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
          createAnthropicStreamTransform({
            model: body.model,
            requestId,
            production: isProduction(),
          }),
        );

        const peeked = await peekAnthropicStream(sseStream);
        if (!peeked) {
          if (upstream.timedOut()) {
            throw upstreamTimeoutError();
          }
          finishReason = 'streaming';
          return createSseResponse(
            toSseStream(new ReadableStream<string>(), {
              appendDone: false,
              onDone: lifecycle.onStreamDone,
            }),
            { requestId },
          );
        }

        const firstError = firstAnthropicStreamErrorEnvelope(peeked.first);
        if (firstError) {
          finishReason = 'error';
          await lifecycle.finalizeNow();
          const { error } = firstError.body;
          return Response.json(
            {
              type: 'error',
              error: {
                ...error,
                message: maybeMaskMessage(error.message, {
                  status: firstError.status,
                  requestId,
                  production: isProduction(),
                }),
              },
              request_id: requestId,
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
            appendDone: false,
            toError: (err) => [
              {
                kind: 'event',
                event: 'error',
                data: toAnthropicErrorResponse(err, { requestId }).body,
              },
            ],
            onDone: lifecycle.onStreamDone,
          }),
          { requestId },
        );
      }

      // --- Non-streaming path ---
      const result = await otelContext.with(activeContext, () => generateText(aiOptions));
      usage = {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
        cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens,
        cacheWriteTokens: result.usage.inputTokenDetails?.cacheWriteTokens,
        reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens,
      };
      finishReason = result.finishReason;

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

      const reasoning = toAnthropicReasoning(result.finalStep.reasoning);

      const anthropicUsage = result.providerMetadata?.anthropic?.usage as Record<string, unknown> | undefined;
      const serviceTier = typeof anthropicUsage?.service_tier === 'string' ? anthropicUsage.service_tier : undefined;
      // Same-provider Anthropic surfaces thinking tokens only on the raw usage
      // object (convert-anthropic-usage.ts leaves outputTokens.reasoning
      // undefined); other providers surface them via outputTokenDetails.
      const thinkingTokens = extractThinkingTokens(anthropicUsage) ?? result.usage.outputTokenDetails?.reasoningTokens;

      // Same-provider only: non-Anthropic upstreams never populate
      // providerMetadata.anthropic, so cross-provider stop_sequence stays null.
      const metaStopSequence = result.providerMetadata?.anthropic?.stopSequence;
      const stopSequence = typeof metaStopSequence === 'string' ? metaStopSequence : undefined;

      // Translate AI SDK result → Anthropic response.
      const response = toAnthropicResponse({
        text: result.text,
        finishReason: result.finishReason,
        rawFinishReason: result.rawFinishReason,
        stopSequence,
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          cacheCreationInputTokens: result.usage.inputTokenDetails?.cacheWriteTokens,
          cacheReadInputTokens: result.usage.inputTokenDetails?.cacheReadTokens,
          serviceTier,
          thinkingTokens,
          cacheCreation: extractCacheCreation(anthropicUsage),
        },
        response: result.response,
        toolCalls: result.toolCalls.map((tc) => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.input,
        })),
        reasoning,
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
      // pre-first-byte reader rejection in `peekAnthropicStream`): the lifecycle
      // never finalizes because `toSseStream` was never constructed, `catch`
      // fired `afterError` and rethrew, and nothing fires `afterOperation`.
      // Detect that via `operationError` being set with an unfinalized
      // lifecycle, and fire `afterOperation` directly (not `finalizeNow`, which
      // would re-fire the `afterError` the `catch` already fired).
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

  // Route-specific error handler — produces Anthropic-shaped errors.
  app.onError((err, c) => {
    if (isClientAbort(err, c.req.raw.signal)) {
      return new Response(null, { status: 499 });
    }
    const requestId = ensureRequestId(c.req.raw);
    c.header('x-request-id', requestId);
    const { body, status } = toAnthropicErrorResponse(err, { requestId });
    const headers = headersForError(err, status);
    for (const [k, v] of Object.entries(headers)) {
      c.header(k, v);
    }
    return c.json(body, toContentfulStatus(status));
  });

  return app;
}

function rejectUnsupportedMessagesParams(body: Record<string, unknown>) {
  const metadata = body.metadata;
  if (
    metadata &&
    typeof metadata === 'object' &&
    (metadata as { user_id?: unknown }).user_id !== undefined &&
    (metadata as { user_id?: unknown }).user_id !== null
  ) {
    throw new RequestValidationError({
      message: '`metadata.user_id` is not supported by this gateway.',
      param: 'metadata.user_id',
    });
  }
}

/**
 * Map the Anthropic wire `thinking` param onto the SDK-read
 * `providerOptions.anthropic.thinking`. The wire uses snake_case
 * `budget_tokens`; the shipped AnthropicProviderOptions reads camelCase
 * `budgetTokens` (anthropic-language-model-options.ts).
 */
function applyThinking(providerOptions: Record<string, Record<string, JSONValue>>, thinking: unknown) {
  if (!thinking || typeof thinking !== 'object') return;
  const { type, budget_tokens } = thinking as {
    type?: unknown;
    budget_tokens?: unknown;
  };
  if (typeof type !== 'string') return;

  const mapped: Record<string, JSONValue> = { type };
  if (typeof budget_tokens === 'number') {
    mapped.budgetTokens = budget_tokens;
  }

  providerOptions.anthropic = {
    ...(providerOptions.anthropic ?? {}),
    thinking: mapped,
  };
}

/**
 * Map `tool_choice.disable_parallel_tool_use` onto the SDK-read
 * `providerOptions.anthropic.disableParallelToolUse`
 * (anthropic-language-model-options.ts).
 */
function applyToolChoiceOptions(providerOptions: Record<string, Record<string, JSONValue>>, toolChoice: unknown) {
  if (!toolChoice || typeof toolChoice !== 'object') return;
  const { disable_parallel_tool_use } = toolChoice as {
    disable_parallel_tool_use?: unknown;
  };
  if (typeof disable_parallel_tool_use !== 'boolean') return;
  providerOptions.anthropic = {
    ...(providerOptions.anthropic ?? {}),
    disableParallelToolUse: disable_parallel_tool_use,
  };
}

/**
 * Map the wire's snake_case `mcp_servers` entries onto the camelCase shape
 * the AI SDK anthropic provider reads from `providerOptions.anthropic.mcpServers`
 * (anthropic-language-model.ts serializes them back to snake_case).
 */
function applyMcpServers(
  providerOptions: Record<string, Record<string, JSONValue>>,
  mcpServers: MessagesRequest['mcp_servers'],
) {
  if (!mcpServers || mcpServers.length === 0) return;

  const mapped: JSONValue[] = mcpServers.map((s) => {
    const server: Record<string, JSONValue> = {
      type: s.type,
      name: s.name,
      url: s.url,
    };
    if (s.authorization_token != null) {
      server.authorizationToken = s.authorization_token;
    }
    if (s.tool_configuration != null) {
      const toolConfiguration: Record<string, JSONValue> = {};
      if (s.tool_configuration.enabled != null) {
        toolConfiguration.enabled = s.tool_configuration.enabled;
      }
      if (s.tool_configuration.allowed_tools != null) {
        toolConfiguration.allowedTools = s.tool_configuration.allowed_tools;
      }
      server.toolConfiguration = toolConfiguration;
    }
    return server;
  });

  providerOptions.anthropic = {
    ...(providerOptions.anthropic ?? {}),
    mcpServers: mapped,
  };
}

/**
 * Map the wire's `container` (string id, or object with agent skills) onto
 * `providerOptions.anthropic.container` — always the object form the AI SDK
 * reads; a bare id string round-trips back to a string on the wire
 * (anthropic-language-model.ts container case). Custom skills carry their
 * wire `skill_id` as `providerReference.anthropic`, which the SDK resolves
 * back to `skill_id` (resolve-provider-reference.ts).
 */
function applyContainer(
  providerOptions: Record<string, Record<string, JSONValue>>,
  container: MessagesRequest['container'],
) {
  if (container == null) return;

  const mapped: Record<string, JSONValue> = {};
  if (typeof container === 'string') {
    mapped.id = container;
  } else {
    if (container.id != null) {
      mapped.id = container.id;
    }
    if (container.skills != null) {
      mapped.skills = container.skills.map(
        (skill): JSONValue => ({
          type: skill.type,
          ...(skill.version != null ? { version: skill.version } : {}),
          ...(skill.skill_id != null
            ? skill.type === 'custom'
              ? { providerReference: { anthropic: skill.skill_id } }
              : { skillId: skill.skill_id }
            : {}),
        }),
      );
    }
  }

  providerOptions.anthropic = {
    ...(providerOptions.anthropic ?? {}),
    container: mapped,
  };
}

function firstAnthropicStreamErrorEnvelope(chunk: string) {
  for (const match of chunk.matchAll(/^event: error\ndata: (.+)$/gm)) {
    const data = match[1];
    if (!data) {
      continue;
    }
    try {
      const parsed = JSON.parse(data) as {
        error?: { type?: string; message?: string };
      };
      const error = parsed.error;
      if (!error?.message) {
        continue;
      }
      return {
        body: {
          type: 'error' as const,
          error: { ...error, message: error.message },
        },
        status: statusForAnthropicErrorType(error.type),
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function peekAnthropicStream(stream: ReadableStream<string>) {
  const reader = stream.getReader();
  const chunks: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      reader.releaseLock();
      return chunks.length === 0 ? undefined : { first: chunks.join(''), stream: streamFromChunks(chunks) };
    }

    chunks.push(value);
    const buffered = chunks.join('');
    if (firstAnthropicStreamErrorEnvelope(buffered) || /^event: content_block_/m.test(value)) {
      return {
        first: buffered,
        stream: streamFromChunks(chunks, reader),
      };
    }
  }
}

function streamFromChunks(chunks: string[], reader?: ReadableStreamDefaultReader<string>) {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
    },
    async pull(controller) {
      if (!reader) {
        controller.close();
        return;
      }
      const next = await reader.read();
      if (next.done) {
        reader.releaseLock();
        controller.close();
        return;
      }
      controller.enqueue(next.value);
    },
    async cancel(reason) {
      await reader?.cancel(reason);
      reader?.releaseLock();
    },
  });
}
