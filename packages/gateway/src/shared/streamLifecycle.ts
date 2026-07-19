// Streaming operation lifecycle — fires `afterOperation`/`afterError`
// exactly once, at the point the SSE stream *actually* concludes, not at
// HTTP-return time.
//
// The inline `try/catch/finally` pattern each route handler uses works for
// non-streaming requests because `return` and "the operation is done" are
// the same moment. For streaming requests they aren't: `return
// createSseResponse(...)` just hands the client a `ReadableStream` handle —
// the client hasn't read a single byte yet, so a `finally` block firing at
// that point sees no real `usage`/`finishReason` and a `durationMs` that's
// really time-to-first-byte.
//
// This module fires hooks from whichever terminal signal actually reaches
// us first:
//   - `streamText`'s `onFinish` — real aggregated usage, once the stream is
//     fully drained. Also fires for the "well-behaved" mid-stream-error
//     case (an `{type:'error'}` chunk followed by a `finish` chunk) with
//     `finishReason: 'error'`.
//   - `streamText`'s `onError` — fires for any `{type:'error'}` chunk. May
//     fire alone (a synchronous provider throw with no steps ever
//     recorded means `onFinish` never runs) or just before `onFinish` in
//     the well-behaved case. We only *capture* here; `onFinish` or the
//     `onStreamDone` fallback decides when to actually fire hooks.
//   - `streamText`'s `onAbort` — client disconnect via `abortSignal`.
//   - `toSseStream`'s wire-level terminal points (`onDone`) — a fallback
//     for the catastrophic case where the readable stream errors out at
//     the reader level and neither `onFinish` nor `onAbort` ever fires.
//
// Exactly-once is enforced by a single `finished` flag shared across every
// entry point; whichever fires first wins and the rest become no-ops.
//
// **Amended invariant:** `afterOperation` always fires exactly once, once
// the operation is established (`base` resolved), at the point the
// operation actually concludes (success, upstream error, or client abort)
// — not at HTTP-return time for streaming paths.

import type { LanguageModelUsage } from 'ai';

import { runHooks, type HookPhase, type HookUsage, type Hooks, type OperationBase } from '../hooks.js';

export type StreamDoneOutcome =
  | { kind: 'done' }
  | { kind: 'error'; error: unknown }
  | { kind: 'cancel'; reason?: unknown };

export type StreamLifecycle = {
  /** Wire directly into `streamText({ onFinish: lifecycle.onFinish })`. */
  onFinish: (event: { finishReason: string; usage: LanguageModelUsage; warnings?: unknown[] }) => Promise<void>;
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
}): StreamLifecycle {
  const { base, hooks, startedAt, phase } = args;

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
      { isolate: true },
    );
  }

  async function fireAfterUpstream(fields: { finishReason?: string; usage?: HookUsage; warnings?: unknown[] }) {
    await runHooks(
      hooks.afterUpstream,
      { ...base, phase: 'afterUpstream', finishReason: fields.finishReason, usage: fields.usage, warnings: fields.warnings },
      { isolate: true },
    );
  }

  async function fireAfterOperation(fields: { finishReason?: string; usage?: HookUsage; error?: unknown }) {
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
      { isolate: true },
    );
  }

  async function finalizeAbort() {
    if (finished) return;
    base.otel['frogbot.status_code_effective'] = 499;
    await fireAfterOperation({ finishReason: capturedFinishReason ?? 'abort', usage: capturedUsage });
  }

  async function finalizeError(error: unknown) {
    if (finished) return;
    await fireAfterError(error);
    await fireAfterOperation({ finishReason: capturedFinishReason ?? 'error', usage: capturedUsage, error });
  }

  return {
    async onFinish(event) {
      capturedUsage = toHookUsage(event.usage);
      capturedFinishReason = event.finishReason;
      if (event.finishReason === 'error') {
        await finalizeError(capturedError ?? new Error('Stream finished with an error.'));
        return;
      }
      await fireAfterUpstream({ finishReason: capturedFinishReason, usage: capturedUsage, warnings: event.warnings });
      await fireAfterOperation({ finishReason: capturedFinishReason, usage: capturedUsage });
    },

    onError(event) {
      // Capture only — `onFinish` may still follow (the well-behaved
      // mid-stream-error case). If it never does (a synchronous provider
      // throw with zero steps recorded), `onStreamDone`/`finalizeNow`
      // picks this up.
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
      // Normal wire-level close with nothing captured by `streamText`'s
      // own callbacks — defensive fallback, should be rare in practice.
      await fireAfterOperation({ finishReason: capturedFinishReason, usage: capturedUsage, error: capturedError });
    },

    async finalizeNow(overrides) {
      if (finished) return;
      const error = capturedError ?? overrides?.error;
      if (error) {
        await finalizeError(error);
        return;
      }
      await fireAfterOperation({ finishReason: overrides?.finishReason ?? capturedFinishReason, usage: capturedUsage });
    },

    hasFinalized: () => finished,
  };
}
