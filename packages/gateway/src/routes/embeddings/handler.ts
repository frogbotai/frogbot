import type { Attributes } from '@opentelemetry/api';
import { embed, embedMany } from 'ai';
import { Hono } from 'hono';

import { toOpenAIErrorResponse, toContentfulStatus } from '../../errors/envelope.js';
import { headersForError } from '../../errors/normalizeAiSdkError.js';
import { isClientAbort } from '../../errors/clientAbort.js';
import { runHooks, type GatewayEnv, type HookPhase, type HookUsage, type Hooks, type OperationBase } from '../../hooks.js';
import { getProviderHooks, mergeHooks } from '../../providers/middleware.js';
import { resolveProvider, type ProviderRegistry } from '../../providers/registry.js';
import { createUpstreamSignal } from '../../shared/upstreamTimeout.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import { parseJsonBody } from '../../utils/parseJsonBody.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import { parseEmbeddingsRequest } from './schema.js';
import { toEmbedParams, toOpenAIEmbeddingsResponse } from './translators/index.js';

export type EmbeddingsRouteContext = {
  registry: ProviderRegistry;
  hooks?: Hooks;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
};

const operation = 'embeddings' as const;

export function embeddingsRoute(ctx: EmbeddingsRouteContext) {
  const app = new Hono();

  app.post('/embeddings', async (c) => {
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

      const body = parseEmbeddingsRequest(await parseJsonBody(c, ctx.maxBodyBytes));
      const resolved = resolveProvider({
        modelId: body.model,
        operation,
        providers: ctx.registry,
      });
      const model = resolved.instance.embeddingModel(resolved.modelName);
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

      const { values, providerOptions } = toEmbedParams(body);
      const headers = prepareForwardHeaders(c.req.raw.headers, {
        userAgent: `@frogbotai/gateway/${GATEWAY_PACKAGE_VERSION}`,
      });

      await runHooks(hooks.beforeUpstream, {
        ...base,
        phase,
        headers,
        providerOptions,
      });

      const baseOptions = {
        model,
        providerOptions,
        abortSignal: createUpstreamSignal(c.req.raw.signal, ctx.upstreamTimeoutMs).signal,
        headers: Object.fromEntries(headers),
      };
      phase = 'upstream';
      const result =
        values.length === 1
          ? await embed({ ...baseOptions, value: values[0] as string })
          : await embedMany({ ...baseOptions, values: values as string[] });
      const embeddings = 'embedding' in result ? [result.embedding] : result.embeddings;
      const upstreamResponses = 'embedding' in result ? [result.response] : result.responses;
      const inputTokens = Number.isFinite(result.usage.tokens) ? result.usage.tokens : 0;
      usage = {
        inputTokens,
        outputTokens: 0,
        totalTokens: inputTokens,
      };

      phase = 'afterUpstream';
      await runHooks(
        hooks.afterUpstream,
        { ...base, phase, finishReason, usage, response: upstreamResponses },
        { isolate: true },
      );

      const response = toOpenAIEmbeddingsResponse({
        embeddings,
        model: body.model,
        promptTokens: inputTokens,
        encodingFormat: body.encoding_format,
      });

      return c.json(response);
    } catch (err) {
      operationError = err;
      if (base) {
        await runHooks(
          hooks.afterError,
          { ...base, phase: 'afterError', failedPhase: phase, error: err },
          { isolate: true },
        );
      }
      throw err;
    } finally {
      if (base) {
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
