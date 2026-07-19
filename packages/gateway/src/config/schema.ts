// Gateway configuration — types and minimal runtime validation.
//
// The config type is derived from the provider table in `providers/registry.ts`.
// Validation is intentionally minimal: TypeScript catches structural errors
// at compile time (config files are .ts-only), and the AI SDK's own
// `loadApiKey` throws descriptive errors for missing/invalid credentials at
// call time. We only guard against the one case TS can't: an empty
// `providers` object that would produce a gateway with nothing to route to.

import {
  PROVIDER_NAMES,
  isProviderInstance,
  providers,
  type ProviderConfigMap,
  type ProviderName,
} from '../providers/registry.js';
import type { ModelCatalog } from '../providers/catalog.js';
import type { OpenAICompatibleConfig } from '../providers/openai-compatible/index.js';
import { ConfigError } from '../errors/gatewayError.js';
import type { Hooks } from '../hooks.js';
import type { GatewayLogger, LoggerOptions } from '../observability/logger.js';
import type { TracingOptions } from '../observability/tracing.js';
import type { SignalLevelInput } from '../observability/signalLevel.js';
import type { Tracer } from '@opentelemetry/api';

// ---------------------------------------------------------------------------
// Public config type
// ---------------------------------------------------------------------------

export type GatewayConfig = {
  providers: ProviderConfigMap;
  /**
   * Additional generic OpenAI-compatible endpoints. Each entry becomes a
   * first-class provider under its declared `name`. Names must not shadow
   * a built-in provider (e.g. `openai`, `groq`).
   */
  openaiCompatible?: OpenAICompatibleConfig[];
  /**
   * Optional allow list. When set (non-empty), only these provider names
   * survive after merging. Applies to both built-in providers and
   * openai-compatible names. Evaluated before `disabled_providers`.
   */
  enabled_providers?: string[];
  /**
   * Optional deny list. Matching provider names are removed after merging.
   */
  disabled_providers?: string[];
  /**
   * Path prefix the gateway serves its routes under in addition to the bare
   * route paths (default `'/v1'`). Routes are always reachable at their bare
   * paths (e.g. `/chat/completions`), so `app.mount('/v1', gw.handler)` works
   * even though the host strips the mount prefix — and direct calls to
   * `/v1/chat/completions` keep working. Pass `''` to serve bare paths only.
   */
  basePath?: string;
  /**
   * Model catalog served by `GET /v1/models` (discovery, validation, display).
   * When omitted, a built-in default catalog is used. The catalog is
   * discovery-only: unlisted models still route if the provider supports them.
   */
  catalog?: ModelCatalog;
  /**
   * Global request-body size cap in bytes, enforced on every route. Oversized
   * requests are rejected with 413 `request_entity_too_large`. When omitted,
   * JSON routes default to 10 MB and audio transcriptions to 25 MB.
   */
  maxBodyBytes?: number;
  /**
   * Server-side deadline (ms) for each upstream provider call. When set, the
   * upstream abort signal is composed as
   * `AbortSignal.any([clientSignal, AbortSignal.timeout(upstreamTimeoutMs)])`
   * and a fired deadline surfaces as 504 `gateway_timeout` instead of hanging
   * until the client disconnects. When omitted, no server-side deadline is
   * imposed (backward compatible) — operators should set one in production.
   * Requires Node >= 20 (`AbortSignal.any`).
   */
  upstreamTimeoutMs?: number;
  hooks?: Hooks;
  /**
   * Either a ready logger instance (e.g. Payload's `payload.logger`, any
   * `pino.Logger`, or anything satisfying {@link GatewayLogger}) or options for
   * the built-in console logger. When omitted, a console logger is created.
   */
  logger?: GatewayLogger | LoggerOptions;
  tracing?: Omit<TracingOptions, 'logger' | 'tracer'>;
  /**
   * Host-provided OpenTelemetry `Tracer`. When set, the gateway records spans
   * through it. When omitted, tracing falls back to `trace.getTracer()` — a
   * no-op unless the host has registered a global provider (e.g. via the
   * Node-only `@frogbotai/gateway/setup` export).
   */
  tracer?: Tracer;
  signalLevel?: SignalLevelInput;
};

// ---------------------------------------------------------------------------
// Validator — guards the single invariant TS can't express
// ---------------------------------------------------------------------------

/**
 * Validates a gateway config at runtime. Ensures at least one provider is
 * configured. All structural/type errors are caught by TypeScript when the
 * user writes their `.ts` config file; this function covers the residual
 * runtime invariant.
 */
export function parseGatewayConfig(input: GatewayConfig): GatewayConfig {
  if (!input || typeof input !== 'object') {
    throw new ConfigError(['config must be an object']);
  }
  if (!input.providers || typeof input.providers !== 'object') {
    throw new ConfigError(['providers must be an object']);
  }
  const configured = Object.values(input.providers).filter((v) => v != null);
  const compat = input.openaiCompatible ?? [];
  if (configured.length === 0 && compat.length === 0) {
    throw new ConfigError(['at least one provider must be configured']);
  }

  // Validate openai-compatible entries: names must be non-empty, unique, and
  // must not shadow a built-in provider.
  const issues: string[] = [];
  const seen = new Set<string>();
  const builtIns = new Set<string>(PROVIDER_NAMES);

  // Validate shorthand provider configs against each provider's required keys.
  // Instance-passthrough (config shape #2) and structural configs without
  // required keys are skipped — this catches JSON/layered config typos at
  // startup instead of deferring to a confusing SDK env-var error.
  for (const [name, cfg] of Object.entries(input.providers)) {
    if (cfg == null) {
      continue;
    }
    const def = providers[name as ProviderName];
    if (!def) {
      const suggestion = closestProviderName(name);
      issues.push(
        `unknown provider "${name}"${suggestion ? ` (did you mean "${suggestion}"?)` : ''}`,
      );
      continue;
    }
    const requiredKeys = 'requiredKeys' in def ? def.requiredKeys : undefined;
    if (!requiredKeys || requiredKeys.length === 0 || isProviderInstance(cfg)) {
      continue;
    }
    if (typeof cfg !== 'object') {
      issues.push(`providers.${name} must be a config object`);
      continue;
    }
    for (const key of requiredKeys) {
      const value = (cfg as Record<string, unknown>)[key];
      if (typeof value !== 'string' || value.length === 0) {
        issues.push(
          `providers.${name}.${key} must be a non-empty string (received: ${value === undefined ? 'undefined' : typeof value})`,
        );
      }
    }
  }

  for (const [i, entry] of compat.entries()) {
    if (!entry || typeof entry !== 'object') {
      issues.push(`openaiCompatible[${i}] must be an object`);
      continue;
    }
    if (typeof entry.name !== 'string' || entry.name.length === 0) {
      issues.push(`openaiCompatible[${i}].name must be a non-empty string`);
      continue;
    }
    if (entry.name.includes('/')) {
      issues.push(`openaiCompatible[${i}].name must not contain "/"`);
    }
    if (builtIns.has(entry.name)) {
      issues.push(
        `openaiCompatible[${i}].name "${entry.name}" shadows a built-in provider`,
      );
    }
    if (seen.has(entry.name)) {
      issues.push(`openaiCompatible[${i}].name "${entry.name}" is duplicated`);
    }
    seen.add(entry.name);
    if (typeof entry.baseURL !== 'string' || entry.baseURL.length === 0) {
      issues.push(`openaiCompatible[${i}].baseURL must be a non-empty string`);
    }
  }
  if (issues.length > 0) {
    throw new ConfigError(issues);
  }
  return input;
}

// ---------------------------------------------------------------------------
// Provider-name typo suggestion (Levenshtein "did you mean")
// ---------------------------------------------------------------------------

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols);
  const curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) {
    prev[j] = j;
  }
  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j++) {
      prev[j] = curr[j];
    }
  }
  return prev[cols - 1];
}

/**
 * Returns the closest known provider name within an edit distance of 2, or
 * `undefined` when nothing is close enough to suggest.
 */
function closestProviderName(name: string): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of PROVIDER_NAMES) {
    const distance = editDistance(name, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= 2 ? best : undefined;
}

// ---------------------------------------------------------------------------
// defineConfig helper — provides autocomplete in config files
// ---------------------------------------------------------------------------

/**
 * Type-safe helper for `gateway.config.ts` files. Returns the input
 * unchanged — its only purpose is providing type-checked autocomplete.
 *
 * ```ts
 * // gateway.config.ts
 * import { defineConfig } from '@frogbotai/gateway'
 * export default defineConfig({ providers: { openai: { apiKey: '...' } } })
 * ```
 */
export function defineConfig(config: GatewayConfig): GatewayConfig {
  return config;
}
