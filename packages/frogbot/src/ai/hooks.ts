// Bridges FrogBot's AI hooks onto the gateway's hook lifecycle.
//
// The gateway carries a generic `context` bag through every phase. FrogBot
// seeds it per-operation with `{ req, agent }` (via `gateway.operation({
// context })` for direct calls, or `gateway.handler(req, { context })` for the
// HTTP proxy). `toGatewayHooks` is a pure, stateless reshaper: it lifts those
// values out of `context` onto the top-level hook args so FrogBot hooks read
// `args.req` / `args.req.user` / `args.agent` — Payload-style — without the
// gateway ever knowing what a FrogbotRequest is.

import type { Hooks, HookUsage } from '@frogbotai/gateway';

import type { AIHookContext, SanitizedAIHooks } from '../types/hooks-ai.js';
import type { FrogbotRequest } from '../types/request.js';

/** Shape FrogBot seeds into the gateway `context` bag for every operation. */
export type AIOperationContext = {
  req?: FrogbotRequest;
  agent?: { slug: string; runId: string };
};

/** Lifts FrogBot's seeded context onto top-level hook fields. */
function lift(context: Record<string, unknown>): AIHookContext {
  const seed = context as AIOperationContext;
  return { req: seed.req, user: seed.req?.user, agent: seed.agent };
}

/**
 * Wrap FrogBot's user hooks as gateway hooks. Each wrapper reads the seeded
 * `req`/`agent` from the phase's `context` bag and spreads them onto the args.
 * No shared state, no AsyncLocalStorage — `req` reaches the hook purely through
 * the per-operation context the caller seeded.
 */
export function toGatewayHooks(hooks: SanitizedAIHooks): Hooks {
  const wrap =
    <A extends { context: Record<string, unknown> }>(hook: (args: A & AIHookContext) => void | Promise<void>) =>
    (args: A) =>
      hook({ ...args, ...lift(args.context) });

  return {
    beforeOperation: hooks.beforeOperation.map(wrap),
    beforeUpstream: hooks.beforeUpstream.map(wrap),
    afterUpstream: hooks.afterUpstream.map(wrap),
    afterError: hooks.afterError.map(wrap),
    afterOperation: hooks.afterOperation.map(wrap),
  };
}

export function toHookUsage(usage: unknown): HookUsage | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const value = usage as {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    tokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
    outputTokenDetails?: { reasoningTokens?: number };
  };
  if (typeof value.tokens === 'number') {
    return {
      inputTokens: value.tokens,
      outputTokens: 0,
      totalTokens: value.tokens,
    };
  }
  if (value.inputTokens == null && value.outputTokens == null && value.totalTokens == null) return undefined;
  const inputTokens = value.inputTokens ?? 0;
  const outputTokens = value.outputTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: value.totalTokens ?? inputTokens + outputTokens,
    cachedInputTokens: value.inputTokenDetails?.cacheReadTokens,
    cacheWriteTokens: value.inputTokenDetails?.cacheWriteTokens,
    reasoningTokens: value.outputTokenDetails?.reasoningTokens,
  };
}
