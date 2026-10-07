import type { Attributes } from '@opentelemetry/api';
import { generateSpeech } from 'ai';
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
  requireSpeechModel,
  resolveProvider,
} from '../../providers/registry.js';
import { createUpstreamSignal } from '../../shared/upstreamTimeout.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import { parseJsonBody } from '../../utils/parseJsonBody.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import { parseSpeechRequest, type SpeechResponseFormat } from './schema.js';
import { toSpeechParams } from './translators/index.js';

const SPEECH_FORMAT_MEDIA_TYPES: Record<SpeechResponseFormat, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/opus',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  pcm: 'audio/pcm',
};

export type SpeechRouteContext = ProviderModelPolicy & {
  registry: ProviderRegistry;
  hooks?: Hooks;
  /** Host logger; defaults to the console logger. */
  logger?: GatewayLogger;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
};

const operation = 'speech' as const;

export function speechRoute(ctx: SpeechRouteContext) {
  const app = new Hono();
  const logger = resolveLogger(ctx.logger);

  app.post('/audio/speech', async (c) => {
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

      const body = parseSpeechRequest(await parseJsonBody(c, ctx.maxBodyBytes));
      const resolved = resolveProvider({
        modelId: body.model,
        operation: 'audio.speech',
        providers: ctx.registry,
        models: ctx.models,
        allowlists: ctx.allowlists,
      });

      const model = requireSpeechModel({
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

      const { providerOptions, outputFormat, ...speechParams } = toSpeechParams(body);
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
      const result = await generateSpeech({
        model,
        ...speechParams,
        outputFormat,
        providerOptions,
        abortSignal: createUpstreamSignal(c.req.raw.signal, ctx.upstreamTimeoutMs).signal,
        headers: Object.fromEntries(headers),
      });

      phase = 'afterUpstream';

      await runHooks(
        hooks.afterUpstream,
        {
          ...base,
          phase,
          finishReason,
          usage,
          response: result.responses,
          warnings: result.warnings,
        },
        { isolate: true, logger },
      );

      return new Response(result.audio.uint8Array, {
        status: 200,
        headers: {
          'content-type': SPEECH_FORMAT_MEDIA_TYPES[outputFormat],
          'x-request-id': requestId,
          ...(result.warnings.length > 0
            ? { 'x-gateway-warnings': JSON.stringify(result.warnings) }
            : {}),
        },
      });
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
