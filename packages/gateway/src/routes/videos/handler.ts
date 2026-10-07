import type { Attributes } from '@opentelemetry/api';
import { experimental_generateVideo as generateVideo } from 'ai';
import { Hono } from 'hono';

import { isClientAbort } from '../../errors/clientAbort.js';
import { toContentfulStatus, toOpenAIErrorResponse } from '../../errors/envelope.js';
import { headersForError } from '../../errors/normalizeAiSdkError.js';
import {
  type GatewayEnv,
  type HookPhase,
  type Hooks,
  type OperationBase,
  runHooks,
} from '../../hooks.js';
import { type GatewayLogger, resolveLogger } from '../../observability/logger.js';
import { getProviderHooks, mergeHooks } from '../../providers/middleware.js';
import {
  type ProviderModelPolicy,
  type ProviderRegistry,
  requireVideoModel,
  resolveProvider,
} from '../../providers/registry.js';
import { createUpstreamSignal } from '../../shared/upstreamTimeout.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import { parseJsonBody } from '../../utils/parseJsonBody.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import { parseVideosRequest } from './schema.js';
import {
  assertSupportedResponseFormat,
  toGenerateVideoParams,
  toOpenAIVideosResponse,
} from './translators/index.js';

export type VideosRouteContext = ProviderModelPolicy & {
  registry: ProviderRegistry;
  hooks?: Hooks;
  /** Host logger; defaults to the console logger. */
  logger?: GatewayLogger;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
};

const operation = 'videos' as const;

export function videosRoute(ctx: VideosRouteContext) {
  const app = new Hono();
  const logger = resolveLogger(ctx.logger);

  app.post('/videos/generations', async (c) => {
    const requestId = ensureRequestId(c.req.raw);
    const context = (c.env as GatewayEnv['Bindings'])?.context ?? {};
    const otel: Attributes = {};
    const startedAt = Date.now();

    let base: OperationBase<typeof operation> | undefined;
    let phase: HookPhase = 'beforeOperation';
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

      const body = parseVideosRequest(await parseJsonBody(c, ctx.maxBodyBytes));
      assertSupportedResponseFormat(body.response_format);
      const resolved = resolveProvider({
        modelId: body.model,
        operation: 'video.generations',
        providers: ctx.registry,
        models: ctx.models,
        allowlists: ctx.allowlists,
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
        { isolate: true, logger },
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
      if (base) {
        await runHooks(
          hooks.afterError,
          { ...base, phase: 'afterError', failedPhase: phase, error: err },
          { isolate: true, logger },
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
