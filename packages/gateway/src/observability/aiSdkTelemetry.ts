import { OpenTelemetry } from '@ai-sdk/otel';
import type { Tracer } from '@opentelemetry/api';
import type { TelemetryOptions } from 'ai';

import {
  includesSignalLevel,
  resolveSignalLevels,
  type SignalLevelInput,
  traceOverrideKey,
} from './signalLevel.js';
import { createGatewayTracer } from './tracing.js';

/** Subset of the AI SDK `telemetry` option the gateway drives per request. */
export type RequestTelemetryOptions = Pick<
  TelemetryOptions,
  'isEnabled' | 'recordInputs' | 'recordOutputs' | 'integrations'
>;

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
  const integration = new OpenTelemetry({
    tracer: createGatewayTracer({ tracer: options.tracer }),
  });

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
