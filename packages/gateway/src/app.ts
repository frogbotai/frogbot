// Gateway Hono app — mounts all routes and wires error handling.
//
// Routes (served bare AND under `basePath`, default `/v1`):
//   POST /v1/chat/completions — OpenAI-compatible (errors are OpenAI-shaped)
//   POST /v1/messages         — Anthropic-compatible (errors are Anthropic-shaped)
//
// Route sub-apps register bare paths (e.g. `/chat/completions`); createApp
// mounts each sub-app twice — at `/` and at `basePath` — so the handler works
// both called directly at `/v1/...` and embedded via `host.mount('/v1', ...)`,
// where the host framework strips the mount prefix before dispatching (G44).
//
// Each route mounts its own error handler for wire-correct error envelopes.
// The global error handler below catches anything that escapes a route
// (should not happen in normal operation) and produces OpenAI-shaped errors
// as a safe default.

import { Hono } from 'hono';

import { GATEWAY_PACKAGE_VERSION } from './version.js';
import { toOpenAIErrorResponse, toContentfulStatus } from './errors/envelope.js';
import { headersForError } from './errors/normalizeAiSdkError.js';
import { isClientAbort } from './errors/clientAbort.js';
import { NotFoundError } from './errors/gatewayError.js';
import { ensureRequestId } from './utils/requestId.js';
import {
  createLogger,
  createLoggingHooks,
  createAiSdkWarningLogger,
  logGatewayError,
  type GatewayLogger,
  type LoggerOptions,
} from './observability/logger.js';
import { createAiSdkTelemetry } from './observability/aiSdkTelemetry.js';
import { createTracingHooks, type TracingOptions } from './observability/tracing.js';
import { createGenAiHooks } from './observability/genAi.js';
import type { SignalLevelInput } from './observability/signalLevel.js';
import { mergeHooks } from './providers/middleware.js';
import type { ModelCatalog } from './providers/catalog.js';
import type { ProviderRegistry } from './providers/registry.js';
import { chatCompletionsRoute } from './routes/chatCompletions/handler.js';
import { embeddingsRoute } from './routes/embeddings/handler.js';
import { imagesRoute } from './routes/images/handler.js';
import { messagesRoute } from './routes/messages/handler.js';
import { modelsRoute } from './routes/models/handler.js';
import { rerankRoute } from './routes/rerank/handler.js';
import { responsesRoute } from './routes/responses/handler.js';
import { speechRoute } from './routes/speech/handler.js';
import { transcriptionsRoute } from './routes/transcriptions/handler.js';
import { videosRoute } from './routes/videos/handler.js';
import type { Tracer } from '@opentelemetry/api';
import type { Hooks } from './hooks.js';

/** A single selectively-mountable route: a WinterCG fetch handler for one endpoint. */
export type GatewayRoute = {
  handler: (request: Request) => Response | Promise<Response>;
};

/** Map of HTTP path → route handler, keyed to match the endpoint's bare path. */
export type GatewayRoutes = {
  '/chat/completions': GatewayRoute;
  '/embeddings': GatewayRoute;
  '/images/generations': GatewayRoute;
  '/messages': GatewayRoute;
  '/models': GatewayRoute;
  '/rerank': GatewayRoute;
  '/responses': GatewayRoute;
  '/audio/speech': GatewayRoute;
  '/audio/transcriptions': GatewayRoute;
  '/videos/generations': GatewayRoute;
};

const routesByApp = new WeakMap<Hono, GatewayRoutes>();

/** Retrieve the per-route handler map for an app built by {@link createApp}. */
export const getRoutes = (app: Hono): GatewayRoutes | undefined => routesByApp.get(app);

export type AppContext = {
  registry: ProviderRegistry;
  /** Model catalog served by `GET /v1/models` (discovery-only; unlisted models still route). */
  catalog?: ModelCatalog;
  /** Prefix routes are also served under, in addition to bare paths (default `/v1`). `''` disables the prefixed mount. */
  basePath?: string;
  hooks?: Hooks;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
  tracing?: Omit<TracingOptions, 'logger' | 'tracer'>;
  tracer?: Tracer;
  logger?: GatewayLogger | LoggerOptions;
  signalLevel?: SignalLevelInput;
};

const isLoggerInstance = (logger: GatewayLogger | LoggerOptions | undefined): logger is GatewayLogger =>
  typeof logger === 'object' && logger !== null && typeof (logger as GatewayLogger).info === 'function';

const normalizeBasePath = (basePath: string | undefined): string => {
  const trimmed = (basePath ?? '/v1').replace(/\/+$/, '');
  if (trimmed === '') {
    return '';
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

export function createApp(ctx: AppContext) {
  const app = new Hono();
  const signalLevel = ctx.tracing?.signalLevel ?? ctx.signalLevel;
  const logger = isLoggerInstance(ctx.logger) ? ctx.logger : createLogger(ctx.logger);
  const tracingHooks = createTracingHooks({
    endpoint: ctx.tracing?.endpoint,
    signalLevel,
    tracer: ctx.tracer,
    logger,
  });
  const loggingHooks = createLoggingHooks(logger);
  const genAiHooks = createGenAiHooks(signalLevel, logger);
  const hooks = mergeHooks(tracingHooks, loggingHooks, genAiHooks, ctx.hooks ?? {});
  const telemetry = createAiSdkTelemetry({ tracer: ctx.tracer, signalLevel });

  if (typeof (globalThis as { AI_SDK_LOG_WARNINGS?: unknown }).AI_SDK_LOG_WARNINGS === 'undefined') {
    (globalThis as { AI_SDK_LOG_WARNINGS?: unknown }).AI_SDK_LOG_WARNINGS = createAiSdkWarningLogger(logger);
  }

  app.use('*', async (c, next) => {
    const requestId = ensureRequestId(c.req.raw);
    c.header('x-request-id', requestId);
    await next();
    // Envelope-layer error log. Pre-resolution failures (schema 400s,
    // unknown-model 404s, `beforeOperation` auth rejections) never reach the
    // `beforeUpstream` logging hook, so this is their only log signal
    // (G101 / OB12). Post-resolution errors are additionally logged with full
    // operation context by the afterError/afterOperation hooks.
    const status = c.res.status;
    if (c.error && status >= 400 && status !== 499) {
      logGatewayError(logger, {
        requestId,
        status,
        path: c.req.path,
        error: c.error,
      });
    }
  });

  // Mount routes — each sub-app registers bare paths (`/chat/completions`).
  // Mounting at both `/` and `basePath` serves `/chat/completions` AND
  // `/v1/chat/completions`, so the handler works mounted at any prefix.
  const routeCtx = {
    registry: ctx.registry,
    hooks,
    maxBodyBytes: ctx.maxBodyBytes,
    upstreamTimeoutMs: ctx.upstreamTimeoutMs,
  };
  const routeApps = {
    '/chat/completions': chatCompletionsRoute({ ...routeCtx, telemetry }),
    '/embeddings': embeddingsRoute(routeCtx),
    '/images/generations': imagesRoute(routeCtx),
    '/messages': messagesRoute({ ...routeCtx, telemetry }),
    '/models': modelsRoute({ registry: ctx.registry, catalog: ctx.catalog }),
    '/rerank': rerankRoute(routeCtx),
    '/responses': responsesRoute({ ...routeCtx, telemetry }),
    '/audio/speech': speechRoute(routeCtx),
    '/audio/transcriptions': transcriptionsRoute(routeCtx),
    '/videos/generations': videosRoute(routeCtx),
  } as const;
  const basePath = normalizeBasePath(ctx.basePath);
  const routes = {} as GatewayRoutes;
  for (const path of Object.keys(routeApps) as (keyof typeof routeApps)[]) {
    const route = routeApps[path];
    app.route('/', route);
    if (basePath) {
      app.route(basePath, route);
    }
    routes[path] = { handler: (request: Request) => route.fetch(request) };
  }
  routesByApp.set(app, routes);

  // Health endpoint — unauthenticated liveness check for Docker HEALTHCHECK
  // and Kubernetes probes. Served bare at `/health` (the standard Docker path)
  // and under `basePath` for consistency with the double-mount route pattern.
  const healthResponse = {
    version: GATEWAY_PACKAGE_VERSION,
    providers: Object.keys(ctx.registry).filter((k) => ctx.registry[k as keyof ProviderRegistry] != null),
    modalities: ['chat', 'embeddings', 'images', 'audio', 'video', 'rerank'],
  };
  app.get('/health', (c) => c.json(healthResponse, 200));
  if (basePath) {
    app.get(`${basePath}/health`, (c) => c.json(healthResponse, 200));
  }

  // Global error handler — produces OpenAI-shaped error envelope (fallback)
  app.onError((err, c) => {
    if (isClientAbort(err, c.req.raw.signal)) {
      return new Response(null, { status: 499 });
    }
    const requestId = ensureRequestId(c.req.raw);
    c.header('x-request-id', requestId);
    const { body, status } = toOpenAIErrorResponse(err, { requestId });
    const headers = headersForError(err, status);
    for (const [k, v] of Object.entries(headers)) {
      c.header(k, v);
    }
    return c.json(body, toContentfulStatus(status));
  });

  // Global 404 fallback — unmapped paths and unsupported methods return an
  // OpenAI-shaped JSON error envelope (matching the global `onError` choice),
  // never Hono's plain-text default.
  app.notFound((c) => {
    const requestId = ensureRequestId(c.req.raw);
    c.header('x-request-id', requestId);
    const { body, status } = toOpenAIErrorResponse(new NotFoundError(), {
      requestId,
    });
    const headers = headersForError(undefined, status);
    for (const [k, v] of Object.entries(headers)) {
      c.header(k, v);
    }
    return c.json(body, toContentfulStatus(status));
  });

  return app;
}
