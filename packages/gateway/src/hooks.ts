// Hook lifecycle types for gateway middleware.
//
// Hooks are the single extension mechanism: first-party provider middleware,
// third-party plugins, and user code all use the same shapes. Provider-level
// middleware (reasoning effort, thinking budget, cache control) registers as
// `beforeUpstream` hooks — nothing special about built-in behavior.
//
// Each lifecycle phase has its own explicit hook type (Payload CMS-style)
// rather than a single generic context narrowed by conditional types. This
// keeps the surface legible: a hook's type signature is the exhaustive list
// of fields it receives — no field is present-but-lying (e.g. `model: ''`)
// and no field is absent-but-typed-as-present.

import type { Attributes } from '@opentelemetry/api';

import type { GatewayLanguageModel } from './providers/registry.js';

export type GatewayEnv = { Bindings: { context: Record<string, unknown> } };

// ---------------------------------------------------------------------------
// Phase + Operation enums
// ---------------------------------------------------------------------------

export type HookOperation =
  | 'chat.completions'
  | 'messages'
  | 'responses'
  | 'embeddings'
  | 'images'
  | 'speech'
  | 'transcriptions'
  | 'videos'
  | 'rerank';

export type HookPhase =
  | 'beforeOperation'
  | 'beforeUpstream'
  | 'upstream'
  | 'afterUpstream'
  | 'afterError'
  | 'afterOperation';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** Token usage passed to `afterUpstream`/`afterOperation`, mirroring the AI SDK's partitions. */
export interface HookUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Portion of inputTokens served from a provider cache (if reported). */
  cachedInputTokens?: number;
  /** Portion of inputTokens written to a provider cache (if reported); billed at a premium. */
  cacheWriteTokens?: number;
  /** Portion of outputTokens spent on reasoning (if reported). */
  reasoningTokens?: number;
}

/** Cross-provider language call params (pre-translation). */
export interface LanguageParams {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
}

/**
 * Fields every hook phase receives, regardless of what's happened yet.
 * `context` and `otel` are the mutable channels hooks use to communicate
 * with each other and with tracing/metrics (Payload CMS's `RequestContext`,
 * hebo's `state`/`otel`).
 */
interface HookBase {
  readonly requestId: string;
  readonly operation: HookOperation;
  readonly startedAt: number;
  /** Mutable bag for passing data between hooks (e.g. auth → billing). */
  context: Record<string, unknown>;
  /** OpenTelemetry attributes contributed by hooks; flushed to spans + metrics. Low-cardinality operational attributes only (no user/session IDs) — every entry becomes a metric dimension. */
  otel: Attributes;
}

/**
 * Fields every route handler hoists to drive its own inline lifecycle
 * (`beforeOperation` → `beforeUpstream` → `afterUpstream`/`afterError` →
 * `afterOperation`). Identical shape across every route — only `operation`
 * narrows per call site via `Op`. See `routes/chatCompletions/handler.ts`
 * for the reference usage: `let base: OperationBase<typeof operation> | undefined`.
 */
export type OperationBase<Op extends HookOperation = HookOperation> = {
  readonly operation: Op;
  readonly requestId: string;
  readonly startedAt: number;
  context: Record<string, unknown>;
  otel: Attributes;
  model: string;
  provider: string;
};

// ---------------------------------------------------------------------------
// Per-phase hook argument types
// ---------------------------------------------------------------------------

export interface BeforeOperationHookArgs extends HookBase {
  readonly phase: 'beforeOperation';
  /**
   * The raw HTTP request, when the operation originates from an HTTP entry
   * (the gateway's own route handlers, or FrogBot's `/api/ai/*` proxy).
   * Absent for in-process operations (`frogbot.generateText(...)` and agents),
   * which have no incoming HTTP request.
   */
  request?: Request;
}

/**
 * Last chance to inspect or mutate the upstream call before the AI SDK fires.
 *
 * Mutation contract — **in-place mutation only** (reassigning a field is a
 * no-op because the handler holds the reference):
 * - `messages`, `params`, `headers`, `providerOptions` are honored on the
 *   language routes (chat, messages, responses); mutate their contents in place.
 * - `headers` and `providerOptions` are honored on every route, including the
 *   modality routes (embeddings, images, speech, transcriptions, videos, rerank).
 * - `messages`/`params` are absent on modality routes — those operations have no
 *   messages or language params. Their inputs (embedding values, image prompt,
 *   rerank query/documents, …) are not exposed here.
 * - `system` and `tools` are read-only. `system` is already baked into
 *   `messages` before this hook runs, and `tools` is read after the hook only
 *   for the (pre-computed) `toolChoice`; mutate `messages` to influence the
 *   prompt instead.
 */
export interface BeforeUpstreamHookArgs extends HookBase {
  readonly phase: 'beforeUpstream';
  readonly model: string;
  readonly provider: string;
  readonly resolvedModel?: GatewayLanguageModel;
  /** Mutable in place on language routes; absent on modality routes. */
  messages?: unknown[];
  /**
   * Read-only. May be a plain string or an array of text blocks (Anthropic
   * system form). Text blocks may carry an optional `cache_control` breakpoint;
   * it is passed through faithfully so hooks can inspect or preserve
   * prompt-cache markers. Mutating this has no effect — `system` is already
   * folded into `messages` before this hook runs.
   */
  readonly system?: string | { type: 'text'; text: string; cache_control?: { type: string; ttl?: string | null } | null }[];
  /** Read-only. Mutating has no effect on the pre-computed `toolChoice`. */
  readonly tools?: Record<string, unknown>;
  /** Mutable in place on language routes; absent on modality routes. */
  params?: LanguageParams;
  headers: Headers;
  providerOptions: Record<string, Record<string, unknown>>;
}

export interface AfterUpstreamHookArgs extends HookBase {
  readonly phase: 'afterUpstream';
  readonly model: string;
  readonly provider: string;
  finishReason?: string;
  usage?: HookUsage;
  response?: unknown;
  warnings?: unknown[];
}

export interface AfterErrorHookArgs extends HookBase {
  readonly phase: 'afterError';
  readonly model: string;
  readonly provider: string;
  /** Which lifecycle phase the failure actually occurred in. */
  readonly failedPhase: HookPhase;
  error: unknown;
}

export interface AfterOperationHookArgs extends HookBase {
  readonly phase: 'afterOperation';
  readonly model: string;
  readonly provider: string;
  finishReason?: string;
  usage?: HookUsage;
  durationMs: number;
  error?: unknown;
}

export type BeforeOperationHook = (args: BeforeOperationHookArgs) => void | Promise<void>;
export type BeforeUpstreamHook = (args: BeforeUpstreamHookArgs) => void | Promise<void>;
export type AfterUpstreamHook = (args: AfterUpstreamHookArgs) => void | Promise<void>;
export type AfterErrorHook = (args: AfterErrorHookArgs) => void | Promise<void>;
export type AfterOperationHook = (args: AfterOperationHookArgs) => void | Promise<void>;

export interface Hooks {
  beforeOperation?: BeforeOperationHook[];
  beforeUpstream?: BeforeUpstreamHook[];
  afterUpstream?: AfterUpstreamHook[];
  afterError?: AfterErrorHook[];
  afterOperation?: AfterOperationHook[];
}

// ---------------------------------------------------------------------------
// Runner (sequential execution; afterError/afterOperation isolate failures)
// ---------------------------------------------------------------------------

export async function runHooks<A extends { readonly requestId: string; readonly operation: HookOperation }>(
  hooks: Array<(args: A) => void | Promise<void>> | undefined,
  args: A,
  opts?: { isolate?: boolean },
): Promise<void> {
  if (!hooks || hooks.length === 0) return;
  for (const hook of hooks) {
    if (opts?.isolate) {
      try {
        await hook(args);
      } catch (err) {
        console.error(`[gateway] hook error (${args.operation}, requestId=${args.requestId}):`, err);
      }
      continue
    }

    await hook(args);
  }
}
