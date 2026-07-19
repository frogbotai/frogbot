import type { Attributes } from '@opentelemetry/api';
import { rerank } from 'ai';
import { Hono } from 'hono';

import { isClientAbort } from '../../errors/clientAbort.js';
import { toOpenAIErrorResponse, toContentfulStatus } from '../../errors/envelope.js';
import { headersForError } from '../../errors/normalizeAiSdkError.js';
import { runHooks, type GatewayEnv, type HookPhase, type Hooks, type OperationBase } from '../../hooks.js';
import { getProviderHooks, mergeHooks } from '../../providers/middleware.js';
import { requireRerankingModel, resolveProvider, type ProviderRegistry } from '../../providers/registry.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import { parseJsonBody } from '../../utils/parseJsonBody.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { createUpstreamSignal } from '../../shared/upstreamTimeout.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import { parseRerankRequest } from './schema.js';
import { toOpenAIRerankResponse, toRerankParams } from './translators/index.js';

export type RerankRouteContext = {
  registry: ProviderRegistry;
  hooks?: Hooks;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
};

const operation = 'rerank' as const;

export function rerankRoute(ctx: RerankRouteContext) {
  const app = new Hono();

  app.post('/rerank', async (c) => {
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

      const body = parseRerankRequest(await parseJsonBody(c, ctx.maxBodyBytes));
      const resolved = resolveProvider({
        modelId: body.model,
        operation,
        providers: ctx.registry,
      });
      const model = requireRerankingModel({
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

      const { providerOptions, ...rerankParams } = toRerankParams(body);
      const headers = prepareForwardHeaders(c.req.raw.headers, {
        userAgent: `@frogbotai/gateway/${GATEWAY_PACKAGE_VERSION}`,
      });

      // `beforeUpstream` hooks may mutate `headers`/`providerOptions` in
      // place; the upstream call is built afterward so it consumes the
      // mutated values. Rerank has no `messages`/`params` of its own, so
      // those fields are omitted from the hook args.
      await runHooks(hooks.beforeUpstream, {
        ...base,
        phase,
        headers,
        providerOptions,
      });

      phase = 'upstream';
      const result = await rerank({
        model,
        ...rerankParams,
        providerOptions,
        abortSignal: createUpstreamSignal(c.req.raw.signal, ctx.upstreamTimeoutMs).signal,
        headers: Object.fromEntries(headers),
      });

      phase = 'afterUpstream';
      await runHooks(hooks.afterUpstream, { ...base, phase, response: result.response }, { isolate: true });

      const response = toOpenAIRerankResponse(result, {
        returnDocuments: body.return_documents ?? false,
        requestId,
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
