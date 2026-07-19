// POST /v1/videos/generations — gateway-defined synchronous video generation.
// OpenAI's async `/v1/videos` job API (POST /videos, GET /videos/{id},
// GET /videos/{id}/content) is not implemented; this endpoint awaits the AI
// SDK's internal polling and returns base64 video bytes in a single response.
//
// The hook lifecycle runs inline (Payload CMS-style): each phase fires at the
// exact point in the handler where it belongs, so the control flow reads
// top-to-bottom with nothing hidden behind a runner abstraction.

import type { Attributes } from '@opentelemetry/api';
import { experimental_generateVideo as generateVideo } from 'ai';
import { Hono } from 'hono';

import { toOpenAIErrorResponse, toContentfulStatus } from '../../errors/envelope.js';
import { headersForError } from '../../errors/normalizeAiSdkError.js';
import { isClientAbort } from '../../errors/clientAbort.js';
import { runHooks, type GatewayEnv, type HookPhase, type Hooks, type OperationBase } from '../../hooks.js';
import { getProviderHooks, mergeHooks } from '../../providers/middleware.js';
import { requireVideoModel, resolveProvider, type ProviderRegistry } from '../../providers/registry.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import { parseJsonBody } from '../../utils/parseJsonBody.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { createUpstreamSignal } from '../../shared/upstreamTimeout.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import { parseVideosRequest } from './schema.js';
import { assertSupportedResponseFormat, toGenerateVideoParams, toOpenAIVideosResponse } from './translators/index.js';

export type VideosRouteContext = {
  registry: ProviderRegistry;
  hooks?: Hooks;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
};

const operation = 'videos' as const;

export function videosRoute(ctx: VideosRouteContext) {
  const app = new Hono();

  app.post('/videos/generations', async (c) => {
    const requestId = ensureRequestId(c.req.raw);
    const context = (c.env as GatewayEnv['Bindings'])?.context ?? {};
    const otel: Attributes = {};
    const startedAt = Date.now();

    // Lifecycle state hoisted for `catch`/`finally`. `base` only exists once
    // the provider is resolved; failures before that point rethrow to
    // `app.onError`, which shapes the OpenAI error envelope.
    let base: OperationBase<typeof operation> | undefined;
    let phase: HookPhase = 'beforeOperation';
    let operationError: unknown;
    let hooks: Hooks = ctx.hooks ?? {};

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

      const body = parseVideosRequest(await parseJsonBody(c, ctx.maxBodyBytes));
      assertSupportedResponseFormat(body.response_format);
      const resolved = resolveProvider({
        modelId: body.model,
        operation: 'video.generations',
        providers: ctx.registry,
      });
      const model = requireVideoModel({
        provider: resolved.instance,
        providerName: resolved.providerName,
        modelName: resolved.modelName,
      });
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

      const { providerOptions, ...videoParams } = toGenerateVideoParams({
        body,
        providerName: resolved.providerName,
      });
      const headers = prepareForwardHeaders(c.req.raw.headers, {
        userAgent: `@frogbotai/gateway/${GATEWAY_PACKAGE_VERSION}`,
      });

      // `beforeUpstream` hooks may mutate `headers`/`providerOptions` in
      // place; the upstream call is built afterward so it consumes the
      // mutated values.
      await runHooks(hooks.beforeUpstream, {
        ...base,
        phase,
        headers,
        providerOptions,
      });

      phase = 'upstream';
      const result = await generateVideo({
        model,
        ...videoParams,
        providerOptions,
        abortSignal: createUpstreamSignal(c.req.raw.signal, ctx.upstreamTimeoutMs).signal,
        headers: Object.fromEntries(headers),
      });
      if (result.warnings.length > 0) {
        c.header('x-gateway-warnings', JSON.stringify(result.warnings));
      }

      phase = 'afterUpstream';
      await runHooks(
        hooks.afterUpstream,
        {
          ...base,
          phase,
          response: result.responses,
          warnings: result.warnings,
        },
        { isolate: true },
      );

      return c.json(
        toOpenAIVideosResponse({
          id: requestId,
          model: body.model,
          videos: result.videos,
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
      if (base) {
        await runHooks(
          hooks.afterOperation,
          {
            ...base,
            phase: 'afterOperation',
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
