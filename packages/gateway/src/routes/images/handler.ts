import type { Attributes } from '@opentelemetry/api';
import { generateImage } from 'ai';
import { Hono } from 'hono';

import { isClientAbort } from '../../errors/clientAbort.js';
import { toContentfulStatus, toOpenAIErrorResponse } from '../../errors/envelope.js';
import { headersForError } from '../../errors/normalizeAiSdkError.js';
import {
  type GatewayEnv,
  type HookPhase,
  type Hooks,
  type HookUsage,
  type OperationBase,
  runHooks,
} from '../../hooks.js';
import { type GatewayLogger, resolveLogger } from '../../observability/logger.js';
import { getProviderHooks, mergeHooks } from '../../providers/middleware.js';
import {
  type ProviderModelPolicy,
  type ProviderRegistry,
  resolveProvider,
} from '../../providers/registry.js';
import { createUpstreamSignal } from '../../shared/upstreamTimeout.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import { parseJsonBody } from '../../utils/parseJsonBody.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import { parseImagesRequest } from './schema.js';
import {
  assertSupportedResponseFormat,
  toGenerateImageParams,
  toOpenAIImagesResponse,
} from './translators/index.js';

export type ImagesRouteContext = ProviderModelPolicy & {
  registry: ProviderRegistry;
  hooks?: Hooks;
  /** Host logger; defaults to the console logger. */
  logger?: GatewayLogger;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
};

const operation = 'images' as const;

export function imagesRoute(ctx: ImagesRouteContext) {
  const app = new Hono();
  const logger = resolveLogger(ctx.logger);

  app.post('/images/generations', async (c) => {
    const requestId = ensureRequestId(c.req.raw);
    const context = (c.env as GatewayEnv['Bindings'])?.context ?? {};
    const otel: Attributes = {};
    const startedAt = Date.now();

    let base: OperationBase<typeof operation> | undefined;
    let phase: HookPhase = 'beforeOperation';
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

      const body = parseImagesRequest(await parseJsonBody(c, ctx.maxBodyBytes));
      assertSupportedResponseFormat(body.response_format);
      const resolved = resolveProvider({
        modelId: body.model,
        operation: 'images.generations',
        providers: ctx.registry,
        models: ctx.models,
        allowlists: ctx.allowlists,
      });

      const model = resolved.instance.imageModel(resolved.modelName);
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

      const { providerOptions, ...imageParams } = toGenerateImageParams({
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
      const result = await generateImage({
        model,
        ...imageParams,
        providerOptions,
        abortSignal: createUpstreamSignal(c.req.raw.signal, ctx.upstreamTimeoutMs).signal,
        headers: Object.fromEntries(headers),
      });

      usage = {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      };

      if (result.warnings.length > 0) {
        c.header('x-gateway-warnings', JSON.stringify(result.warnings));
      }

      phase = 'afterUpstream';

      await runHooks(
        hooks.afterUpstream,
        {
          ...base,
          phase,
          usage,
          response: result.responses,
          warnings: result.warnings,
        },
        { isolate: true, logger },
      );

      return c.json(toOpenAIImagesResponse(result.images, usage));
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
