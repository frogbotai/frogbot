import type { Attributes } from '@opentelemetry/api';
import { transcribe } from 'ai';
import { Hono } from 'hono';

import { toOpenAIErrorResponse, toContentfulStatus } from '../../errors/envelope.js';
import { isClientAbort } from '../../errors/clientAbort.js';
import { headersForError } from '../../errors/normalizeAiSdkError.js';
import { RequestValidationError, BodyTooLargeError, isGatewayError } from '../../errors/gatewayError.js';
import { runHooks, type GatewayEnv, type HookPhase, type HookUsage, type Hooks, type OperationBase } from '../../hooks.js';
import { getProviderHooks, mergeHooks } from '../../providers/middleware.js';
import { requireTranscriptionModel, resolveProvider, type ProviderRegistry } from '../../providers/registry.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { createUpstreamSignal } from '../../shared/upstreamTimeout.js';
import { withStreamBodyLimit } from '../../utils/streamBodyLimit.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import { parseTranscriptionRequest } from './schema.js';
import { toOpenAITranscriptionResponse, toTranscribeParams } from './translators/index.js';

const DEFAULT_MAX_BODY_BYTES = 25 * 1024 * 1024;

export type TranscriptionsRouteContext = {
  registry: ProviderRegistry;
  hooks?: Hooks;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
};

const operation = 'transcriptions' as const;

export function transcriptionsRoute(ctx: TranscriptionsRouteContext) {
  const app = new Hono();

  app.post('/audio/transcriptions', async (c) => {
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

      const maxBodyBytes = ctx.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
      const contentLengthHeader = c.req.header('content-length');
      const contentLength =
        contentLengthHeader == null ? undefined : Number(contentLengthHeader);
      if (
        contentLength != null &&
        (!Number.isFinite(contentLength) || contentLength < 0)
      ) {
        throw new RequestValidationError({
          message: 'Invalid Content-Length header',
          param: 'content-length',
        });
      }
      if (contentLength != null && contentLength > maxBodyBytes) {
        throw new BodyTooLargeError({
          message: `Request body exceeds ${maxBodyBytes} bytes`,
          param: 'content-length',
        });
      }
      const request = contentLength == null
        ? withStreamBodyLimit(c.req.raw, maxBodyBytes)
        : c.req.raw;

      const body = parseTranscriptionRequest(normalizeMultipartBody(await parseMultipartBody(request)));
      if (body.file.size > maxBodyBytes) {
        throw new BodyTooLargeError({
          message: `File exceeds ${maxBodyBytes} bytes`,
          param: 'file',
        });
      }

      const resolved = resolveProvider({
        modelId: body.model,
        operation: 'audio.transcriptions',
        providers: ctx.registry,
      });
      const model = requireTranscriptionModel({
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

      const { providerOptions, audio } = await toTranscribeParams({
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
      const result = await transcribe({
        model,
        audio,
        providerOptions,
        abortSignal: createUpstreamSignal(c.req.raw.signal, ctx.upstreamTimeoutMs).signal,
        headers: Object.fromEntries(headers),
      });

      phase = 'afterUpstream';
      await runHooks(
        hooks.afterUpstream,
        { ...base, phase, finishReason, usage, response: result.responses },
        { isolate: true },
      );

      const response = toOpenAITranscriptionResponse({
        result,
        responseFormat: body.response_format,
      });
      if (typeof response === 'string') {
        return new Response(response, {
          status: 200,
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'x-request-id': requestId,
          },
        });
      }
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

  // Route-specific error handler — produces OpenAI-shaped errors, matching
  // `chatCompletions/handler.ts`.
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

function normalizeMultipartBody(body: Record<string, unknown>) {
  const bracketedGranularities = body['timestamp_granularities[]'];
  if (bracketedGranularities == null || body.timestamp_granularities != null) return body;
  return { ...body, timestamp_granularities: bracketedGranularities };
}

async function parseMultipartBody(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    if (isGatewayError(err)) throw err;
    return {};
  }

  const body: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    const current = body[key];
    if (current == null) {
      body[key] = value;
    } else if (Array.isArray(current)) {
      current.push(value);
    } else {
      body[key] = [current, value];
    }
  }
  return body;
}

