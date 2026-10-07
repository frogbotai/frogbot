import type { LanguageModelUsage } from 'ai';

import {
  type HookPhase,
  type Hooks,
  type HookUsage,
  type OperationBase,
  runHooks,
} from '../hooks.js';
import type { GatewayLogger } from '../observability/logger.js';

export type StreamDoneOutcome =
  { kind: 'done' } | { kind: 'error'; error: unknown } | { kind: 'cancel'; reason?: unknown };

export type StreamLifecycle = {
  /** Wire directly into `streamText({ onFinish: lifecycle.onFinish })`. */
  onFinish: (event: {
    finishReason: string;
    response?: unknown;
    usage: LanguageModelUsage;
    warnings?: unknown[];
  }) => Promise<void>;
  /** Wire directly into `streamText({ onError: lifecycle.onError })`. */
  onError: (event: { error: unknown }) => void;
  /** Wire directly into `streamText({ onAbort: lifecycle.onAbort })`. */
  onAbort: () => Promise<void>;
  /** Wire into every `toSseStream({ onDone: lifecycle.onStreamDone })` call in the streaming branch. */
  onStreamDone: (outcome: StreamDoneOutcome) => Promise<void>;
  /**
   * Explicit finalize for early-return branches that never reach
   * `toSseStream` (the "first chunk is an error envelope" JSON-error
   * returns). Uses whatever `onError` already captured, if anything.
   */
  finalizeNow: (overrides?: { error?: unknown; finishReason?: string }) => Promise<void>;
  /** Whether `afterOperation` has already fired — lets the outer `finally` skip a second fire. */
  hasFinalized: () => boolean;
};

export function createStreamLifecycle(args: {
  base: OperationBase;
  hooks: Hooks;
  startedAt: number;
  phase: HookPhase;
  logger: GatewayLogger;
}): StreamLifecycle {
  const { base, hooks, startedAt, phase, logger } = args;

  let finished = false;
  let capturedError: unknown;
  let capturedUsage: HookUsage | undefined;
  let capturedFinishReason: string | undefined;

  function toHookUsage(usage: LanguageModelUsage): HookUsage {
    return {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
      cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
      reasoningTokens: usage.outputTokenDetails?.reasoningTokens,
    };
  }

  async function fireAfterError(error: unknown) {
    await runHooks(
      hooks.afterError,
      { ...base, phase: 'afterError', failedPhase: phase, error },
      { isolate: true, logger },
    );
  }

  async function fireAfterUpstream(fields: {
    finishReason?: string;
    response?: unknown;
    usage?: HookUsage;
    warnings?: unknown[];
  }) {
    await runHooks(
      hooks.afterUpstream,
      {
        ...base,
        phase: 'afterUpstream',
        finishReason: fields.finishReason,
        response: fields.response,
        usage: fields.usage,
        warnings: fields.warnings,
      },
      { isolate: true, logger },
    );
  }

  async function fireAfterOperation(fields: {
    finishReason?: string;
    usage?: HookUsage;
    error?: unknown;
  }) {
    if (finished) return;
    finished = true;

    await runHooks(
      hooks.afterOperation,
      {
        ...base,
        phase: 'afterOperation',
        finishReason: fields.finishReason,
        usage: fields.usage,
        durationMs: Date.now() - startedAt,
        error: fields.error,
      },
      { isolate: true, logger },
    );
  }

  async function finalizeAbort() {
    if (finished) return;
    base.otel['frogbot.status_code_effective'] = 499;

    await fireAfterOperation({
      finishReason: capturedFinishReason ?? 'abort',
      usage: capturedUsage,
    });
  }

  async function finalizeError(error: unknown) {
    if (finished) return;
    await fireAfterError(error);

    await fireAfterOperation({
      finishReason: capturedFinishReason ?? 'error',
      usage: capturedUsage,
      error,
    });
  }

  return {
    async onFinish(event) {
      capturedUsage = toHookUsage(event.usage);
      capturedFinishReason = event.finishReason;
      if (event.finishReason === 'error') {
        await finalizeError(capturedError ?? new Error('Stream finished with an error.'));

        return;
      }

      await fireAfterUpstream({
        finishReason: capturedFinishReason,
        response: event.response,
        usage: capturedUsage,
        warnings: event.warnings,
      });

      await fireAfterOperation({ finishReason: capturedFinishReason, usage: capturedUsage });
    },

    onError(event) {
      capturedError = event.error;
    },

    async onAbort() {
      await finalizeAbort();
    },

    async onStreamDone(outcome) {
      if (finished) return;
      if (outcome.kind === 'cancel') {
        await finalizeAbort();

        return;
      }

      if (outcome.kind === 'error') {
        await finalizeError(capturedError ?? outcome.error);

        return;
      }

      await fireAfterOperation({
        finishReason: capturedFinishReason,
        usage: capturedUsage,
        error: capturedError,
      });
    },

    async finalizeNow(overrides) {
      if (finished) return;
      const error = capturedError ?? overrides?.error;
      if (error) {
        await finalizeError(error);

        return;
      }

      await fireAfterOperation({
        finishReason: overrides?.finishReason ?? capturedFinishReason,
        usage: capturedUsage,
      });
    },

    hasFinalized: () => finished,
  };
}
