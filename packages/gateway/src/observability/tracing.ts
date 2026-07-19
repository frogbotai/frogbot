import {
  context,
  trace,
  SpanStatusCode,
  type Exception,
  type Span,
  type SpanOptions,
  type Tracer,
} from '@opentelemetry/api';

import type {
  AfterErrorHookArgs,
  AfterOperationHookArgs,
  AfterUpstreamHookArgs,
  BeforeUpstreamHookArgs,
  Hooks,
} from '../hooks.js';
import { isProduction } from '../shared/runtimeDetection.js';
import type { GatewayLogger } from './logger.js';
import {
  includesSignalLevel,
  resolveSignalLevels,
  signalLevelFromBody,
  traceOverrideKey,
  type SignalLevelInput,
} from './signalLevel.js';

export type TracingOptions = {
  endpoint?: string;
  signalLevel?: SignalLevelInput;
  logger?: GatewayLogger;
  tracer?: Tracer;
};

/** Fields needed to tag/attribute a span; shared shape across the phases that can create or annotate one. */
type TracedHookArgs = Pick<BeforeUpstreamHookArgs, 'requestId' | 'operation' | 'model' | 'provider' | 'context'>;

const noopSpan = trace.wrapSpanContext({
  traceId: '00000000000000000000000000000000',
  spanId: '0000000000000000',
  traceFlags: 0,
});

export function createGatewayTracer(options: TracingOptions = {}): Tracer {
  const tracer = options.tracer ?? trace.getTracer('@frogbotai/gateway');
  return new Proxy(tracer, {
    get(target, prop, receiver) {
      if (prop !== 'startSpan') return Reflect.get(target, prop, receiver);
      return (name: string, spanOptions?: SpanOptions, ctx = context.active()) => {
        const span = target.startSpan(name, spanOptions, ctx);
        const hookArgs = ctx.getValue(hookContextKey) as TracedHookArgs | undefined;
        tagSpan(span, hookArgs);
        return span;
      };
    },
  });
}

export function createTracingHooks(options: TracingOptions = {}): Hooks {
  const baseLevels = resolveSignalLevels(options.signalLevel);
  const baseAllOff = Object.values(baseLevels).every((level) => level === 'off');
  const spans = new Map<string, Span>();
  const tracer = createGatewayTracer(options);

  return {
    beforeOperation: [
      async (args) => {
        // A per-request `trace` override can only downgrade from the operator
        // baseline, never escalate it (enforced as a per-namespace ceiling in
        // `resolveSignalLevels`). When every base namespace is `'off'` no
        // downgrade is possible, so no span/metric path will ever read the
        // override — skip the body clone + JSON parse entirely.
        if (baseAllOff) {
          args.context[traceOverrideKey] = 'off';
          return;
        }
        // The `trace` override is a gateway extension field carried only in JSON
        // request bodies. Skip the body clone + parse for non-JSON requests
        // (multipart uploads on transcriptions/images/speech routes) so a large
        // binary upload isn't buffered into memory just to fail a JSON parse.
        // In-process operations have no HTTP request — nothing to parse.
        if (!args.request) {
          args.context[traceOverrideKey] = undefined;
          return;
        }
        const contentType = args.request.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          args.context[traceOverrideKey] = undefined;
          return;
        }
        let body: unknown;
        try {
          body = await args.request.clone().json();
        } catch {
          // Not valid JSON — leave `body` undefined.
        }
        args.context[traceOverrideKey] = signalLevelFromBody(body);
      },
    ],
    beforeUpstream: [
      (args) => {
        const levels = resolveSignalLevels(args.context[traceOverrideKey] as SignalLevelInput, baseLevels);
        if (!includesSignalLevel(levels.frogbot, 'required')) return;
        const parent = context.active().setValue(hookContextKey, args);
        const span = tracer.startSpan(`gateway.${args.operation}`, { attributes: baseAttributes(args) }, parent);
        spans.set(args.requestId, span);
        // Stash the span's context so handlers can activate it around the
        // upstream AI SDK call — SDK-created spans become children of the
        // gateway span and the Proxy tracer's tenant/api-key tagging fires.
        args.context[otelContextKey] = trace.setSpan(parent, span);
      },
    ],
    afterUpstream: [
      (args: AfterUpstreamHookArgs) => {
        const span = spans.get(args.requestId) ?? noopSpan;
        for (const warning of args.warnings ?? []) {
          span.addEvent('ai.sdk.warning', { warning: JSON.stringify(warning) });
        }
      },
    ],
    afterError: [
      (args: AfterErrorHookArgs) => {
        const span = spans.get(args.requestId) ?? noopSpan;
        span.recordException(sanitizeForTelemetry(args.error));
        span.setStatus({ code: SpanStatusCode.ERROR });
      },
    ],
    afterOperation: [
      (args: AfterOperationHookArgs) => {
        const span = spans.get(args.requestId) ?? noopSpan;
        span.setAttributes({
          ...args.otel,
          'frogbot.duration_ms': args.durationMs,
          'gen_ai.response.finish_reasons': args.finishReason ?? '',
        });
        span.end();
        spans.delete(args.requestId);
      },
    ],
  };
}

const hookContextKey = Symbol.for('frogbot.gateway.hookContext');

/** Context key where `beforeUpstream` stashes the OTel `Context` carrying the gateway span, for handlers to activate around the upstream AI SDK call. */
export const otelContextKey = 'frogbot.gateway.otelContext';

/**
 * Mirrors `logger.ts`'s production guard: `exception.message`/stack may carry
 * PII (provider payload excerpts, user input in validation errors, secrets in
 * stack frames — see OTel semconv #2967). In production we record only the
 * error name/type for classification, stripping message and stack. Elsewhere
 * we record the full error for debugging.
 */
function sanitizeForTelemetry(error: unknown): Exception {
  if (!isProduction()) {
    return error instanceof Error ? error : String(error);
  }
  return { name: error instanceof Error ? error.name : 'Error' };
}

function baseAttributes(args: TracedHookArgs) {
  return {
    'frogbot.request_id': args.requestId,
    'frogbot.operation': args.operation,
    'gen_ai.operation.name': args.operation,
    'gen_ai.request.model': args.model,
    'gen_ai.system': args.provider,
  };
}

function tagSpan(span: Span, args: TracedHookArgs | undefined): void {
  const auth = args?.context as
    | {
        tenantId?: string;
        tenant?: { id?: string };
        apiKeyId?: string;
        apiKey?: { id?: string };
      }
    | undefined;
  if (!auth) return;
  const tenantId = auth.tenantId ?? auth.tenant?.id;
  const apiKeyId = auth.apiKeyId ?? auth.apiKey?.id;
  if (tenantId) {
    span.setAttribute('tenant.id', tenantId);
  }
  if (apiKeyId) {
    span.setAttribute('api_key.id', apiKeyId);
  }
}
