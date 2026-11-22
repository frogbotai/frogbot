import type { SanitizedAIConfig } from './types.js';

export async function registerAITelemetry(ai: SanitizedAIConfig): Promise<void> {
  if (!ai.telemetry.enabled) return;

  let otelModule: typeof import('@ai-sdk/otel') | undefined; // eslint-disable-line @typescript-eslint/consistent-type-imports -- the optional peer is imported lazily
  try {
    otelModule = await import('@ai-sdk/otel');
  } catch {
    return;
  }

  const { registerTelemetry } = await import('ai');
  const { OpenTelemetry } = otelModule;

  const deploymentId = ai._internal.deploymentId;
  const userEnrichSpan = ai.telemetry.enrichSpan;

  registerTelemetry(
    new OpenTelemetry({
      enrichSpan: (args) => ({
        'frogbot.deployment': deploymentId,
        ...(userEnrichSpan?.(args) ?? {}),
      }),
    }),
  );
}
