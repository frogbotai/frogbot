import type { Attributes } from '@opentelemetry/api';
import { experimental_evaluate } from 'ai';
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
import { directUsage } from '../../modelHooks.js';
import { getProviderHooks, mergeHooks } from '../../providers/middleware.js';
import {
  type ProviderModelPolicy,
  type ProviderRegistry,
  requireEvaluationModel,
  resolveProvider,
} from '../../providers/registry.js';
import { createUpstreamSignal } from '../../shared/upstreamTimeout.js';
import { prepareForwardHeaders } from '../../utils/headers.js';
import { parseJsonBody } from '../../utils/parseJsonBody.js';
import { ensureRequestId } from '../../utils/requestId.js';
import { GATEWAY_PACKAGE_VERSION } from '../../version.js';
import { parseEvaluateRequest } from './schema.js';

export type EvaluateRouteContext = ProviderModelPolicy & {
  registry: ProviderRegistry;
  hooks?: Hooks;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
};

const operation = 'evaluate' as const;

export function evaluateRoute(ctx: EvaluateRouteContext) {
  const app = new Hono();

  app.post('/evaluate', async (c) => {
    const requestId = ensureRequestId(c.req.raw);
    const context = (c.env as GatewayEnv['Bindings'])?.context ?? {};
    const otel: Attributes = {};
    const startedAt = Date.now();

    let base: OperationBase<typeof operation> | undefined;
    let phase: HookPhase = 'beforeOperation';
    let operationError: unknown;
    let usage: HookUsage | undefined;
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

      const body = parseEvaluateRequest(await parseJsonBody(c, ctx.maxBodyBytes));
      const resolved = resolveProvider({
        modelId: body.model,
        operation,
        providers: ctx.registry,
        models: ctx.models,
        allowlists: ctx.allowlists,
      });
      const model = requireEvaluationModel({
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

      const providerOptions = body.providerOptions ?? {};
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

      const result = await experimental_evaluate({
        model,
        state: body.state,
        questions: body.questions,
        headers: Object.fromEntries(headers),
        abortSignal: createUpstreamSignal(c.req.raw.signal, ctx.upstreamTimeoutMs).signal,
        providerOptions,
      });

      usage = directUsage(result.usage);
      phase = 'afterUpstream';

      await runHooks(
        hooks.afterUpstream,
        { ...base, phase, response: result.response, usage },
        { isolate: true },
      );

      const reportedModelId = result.response.modelId;
      let responseModel = body.model;

      if (reportedModelId && reportedModelId !== model.modelId) {
        responseModel = reportedModelId.startsWith(`${resolved.providerName}/`)
          ? reportedModelId
          : `${resolved.providerName}/${reportedModelId}`;
      }

      return c.json({
        model: responseModel,
        answers: result.answers,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        },
        ...(result.providerMetadata === undefined
          ? {}
          : { providerMetadata: result.providerMetadata }),
      });
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
            durationMs: Date.now() - startedAt,
            usage,
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

    for (const [name, value] of Object.entries(headersForError(err, status))) {
      c.header(name, value);
    }

    return c.json(body, toContentfulStatus(status));
  });

  return app;
}
