// AI SDK telemetry activation (api-only, edge-safe).
//
// The AI SDK v7 emits its inner spans (`invoke_agent`, step, model-call, tool
// spans) only when a telemetry integration is passed to the call. Without it
// the `'full'` signal level is a no-op and the gateway span is the only trace
// signal. `createAiSdkTelemetry` wires the `@ai-sdk/otel` OpenTelemetry
// integration through the gateway's Proxy tracer (so tenant/api-key tagging
// applies to SDK-created spans) and gates recording on the resolved per-request
// signal levels.
//
// Note: v7 deprecates `experimental_telemetry` in favor of `telemetry`; the
// gateway passes only the new key.

import { OpenTelemetry } from '@ai-sdk/otel';
import type { Tracer } from '@opentelemetry/api';
import type { TelemetryOptions } from 'ai';

import { includesSignalLevel, resolveSignalLevels, traceOverrideKey, type SignalLevelInput } from './signalLevel.js';
import { createGatewayTracer } from './tracing.js';

/** Subset of the AI SDK `telemetry` option the gateway drives per request. */
export type RequestTelemetryOptions = Pick<TelemetryOptions, 'isEnabled' | 'recordInputs' | 'recordOutputs' | 'integrations'>;

export type AiSdkTelemetry = {
  /** Build the AI SDK `telemetry` option for one request from its resolved signal levels (`context` is the hook context bag carrying the per-request trace override). */
  forRequest: (context: Record<string, unknown>) => RequestTelemetryOptions;
};

export type AiSdkTelemetryOptions = {
  tracer?: Tracer;
  signalLevel?: SignalLevelInput;
};

export function createAiSdkTelemetry(options: AiSdkTelemetryOptions = {}): AiSdkTelemetry {
  const baseLevels = resolveSignalLevels(options.signalLevel);
  const integration = new OpenTelemetry({ tracer: createGatewayTracer({ tracer: options.tracer }) });
  return {
    forRequest(context) {
      const levels = resolveSignalLevels(context[traceOverrideKey] as SignalLevelInput, baseLevels);
      if (levels.gen_ai === 'off' || !includesSignalLevel(levels.frogbot, 'recommended')) {
        return { isEnabled: false };
      }
      return {
        isEnabled: true,
        recordInputs: levels.gen_ai === 'full',
        recordOutputs: levels.gen_ai === 'full',
        integrations: [integration],
      };
    },
  };
}
