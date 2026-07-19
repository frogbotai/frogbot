import { metrics, type Attributes, type Histogram } from '@opentelemetry/api';

import { httpStatusText, statusForError } from '../errors/envelope.js';
import type { AfterOperationHookArgs, HookUsage, Hooks } from '../hooks.js';
import { createLogger, type GatewayLogger } from './logger.js';
import { includesSignalLevel, resolveSignalLevels, traceOverrideKey, type SignalLevelInput, type SignalLevels } from './signalLevel.js';

type TracedOperation = Pick<AfterOperationHookArgs, 'operation' | 'model' | 'provider'> & Partial<Pick<AfterOperationHookArgs, 'otel'>>;

const getMeter = () => metrics.getMeter('@frogbotai/gateway');

let tokenUsageHistogram: Histogram | undefined;
let requestDurationHistogram: Histogram | undefined;

const getTokenUsage = () =>
  (tokenUsageHistogram ??= getMeter().createHistogram('gen_ai.client.token.usage', { unit: '{token}' }));

// Spec-aligned bucket advice (OTel GenAI semconv `gen_ai.server.request.duration`,
// seconds) with a tail extended to 30min for slow provider tiers, matching hebo.
const getRequestDuration = () =>
  (requestDurationHistogram ??= getMeter().createHistogram('gen_ai.server.request.duration', {
    unit: 's',
    advice: {
      explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600, 900, 1800],
    },
  }));

const safe = (value: number): number => (!Number.isFinite(value) ? 0 : Math.max(0, value));

export function recordGenAiTokenUsage(ctx: TracedOperation, usage: HookUsage | undefined, trace?: SignalLevelInput, baseLevels?: Required<SignalLevels>, logger: GatewayLogger = createLogger()): void {
  if (!usage || !includesSignalLevel(resolveSignalLevels(trace, baseLevels).gen_ai, 'recommended')) return;

  const inputTokens = safe(usage.inputTokens);
  const outputTokens = safe(usage.outputTokens);
  const cacheRead = safe(usage.cachedInputTokens ?? 0);
  const cacheWrite = safe(usage.cacheWriteTokens ?? 0);
  const reasoningOutput = safe(usage.reasoningTokens ?? 0);

  if (usage.inputTokens - (usage.cachedInputTokens ?? 0) - (usage.cacheWriteTokens ?? 0) < 0) {
    logger.warn({ inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens, cacheWriteTokens: usage.cacheWriteTokens }, '[telemetry] cached input tokens exceed input total; clamping uncached to 0');
  }
  if (usage.outputTokens - (usage.reasoningTokens ?? 0) < 0) {
    logger.warn({ outputTokens: usage.outputTokens, reasoningTokens: usage.reasoningTokens }, '[telemetry] reasoning tokens exceed output total; clamping non-reasoning to 0');
  }

  const base = { ...ctx.otel, 'gen_ai.operation.name': ctx.operation, 'gen_ai.request.model': ctx.model, 'gen_ai.system': ctx.provider };
  const tokenUsage = getTokenUsage();
  const emit = (value: number, extra: Record<string, unknown>) => tokenUsage.record(value, { ...base, ...extra });

  // Input: partition only when a cache breakdown is reported; otherwise emit a bare point.
  if (usage.cachedInputTokens === undefined && usage.cacheWriteTokens === undefined) {
    emit(inputTokens, { 'gen_ai.token.type': 'input' });
  } else {
    const uncachedInput = safe(inputTokens - cacheRead - cacheWrite);
    emit(cacheRead, { 'gen_ai.token.type': 'input', 'gen_ai.token.cache': 'read' });
    emit(cacheWrite, { 'gen_ai.token.type': 'input', 'gen_ai.token.cache': 'creation' });
    emit(uncachedInput, { 'gen_ai.token.type': 'input', 'gen_ai.token.cache': 'uncached' });
  }

  // Output: partition only when a reasoning breakdown is reported; otherwise emit a bare point.
  if (usage.reasoningTokens === undefined) {
    emit(outputTokens, { 'gen_ai.token.type': 'output' });
  } else {
    const textOutput = safe(outputTokens - reasoningOutput);
    emit(reasoningOutput, { 'gen_ai.token.type': 'output', 'gen_ai.token.reasoning': true });
    emit(textOutput, { 'gen_ai.token.type': 'output', 'gen_ai.token.reasoning': false });
  }
}

/**
 * Records end-to-end request duration (`gen_ai.server.request.duration`, seconds).
 * When the operation ended in an error, a spec-conditional `error.type` attribute
 * is added, labeled `"<status> <reason phrase>"` (hebo's convention). Status is
 * taken from the abort-effective code in `otel` when present, else derived from
 * the error via the gateway's canonical error→status translator.
 */
export function recordRequestDuration(ctx: TracedOperation, durationMs: number, error: unknown, trace?: SignalLevelInput, baseLevels?: Required<SignalLevels>): void {
  if (!includesSignalLevel(resolveSignalLevels(trace, baseLevels).gen_ai, 'recommended')) {
    return;
  }

  const base: Attributes = { ...ctx.otel, 'gen_ai.operation.name': ctx.operation, 'gen_ai.request.model': ctx.model, 'gen_ai.system': ctx.provider };

  const effective = ctx.otel?.['frogbot.status_code_effective'];
  const status = typeof effective === 'number' ? effective : error !== undefined ? statusForError(error) : 200;
  if (status !== 200) {
    base['error.type'] = `${status} ${httpStatusText(status).toLowerCase()}`;
  }

  getRequestDuration().record(safe(durationMs) / 1000, base);
}

export function createGenAiHooks(trace?: SignalLevelInput, logger?: GatewayLogger): Hooks {
  const baseLevels = resolveSignalLevels(trace);
  return {
    afterOperation: [(args) => {
      const override = args.context[traceOverrideKey] as SignalLevelInput;
      recordGenAiTokenUsage(args, args.usage, override, baseLevels, logger);
      recordRequestDuration(args, args.durationMs, args.error, override, baseLevels);
    }],
  };
}
