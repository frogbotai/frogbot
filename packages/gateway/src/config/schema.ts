// Gateway configuration — types and minimal runtime validation.
//
// The config type is derived from the provider table in `providers/registry.ts`.
// Validation is intentionally minimal: TypeScript catches structural errors
// at compile time (config files are .ts-only), and the AI SDK's own
// `loadApiKey` throws descriptive errors for missing/invalid credentials at
// call time. We only guard against the one case TS can't: an empty
// `providers` object that would produce a gateway with nothing to route to.

import {
  isProviderInstance,
  providers,
  type ProviderConfigMap,
  type ProviderName,
  type ProvidersInput,
} from '../providers/registry.js';
import type { ModelCatalog } from '../providers/catalog.js';
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
  /**
   * Provider map. Known provider keys (e.g. `openai`, `amazon-bedrock`) take
   * that provider's typed config or a pre-built instance. Any other key is a
   * generic OpenAI-compatible endpoint and requires a `baseURL` — the key
   * becomes the `<name>/<model>` dispatch prefix (e.g. `ollama`, `lm-studio`).
   */
  providers: ProviderConfigMap;
  /**
   * Optional allow list. When set (non-empty), only these provider names
   * survive after merging. Applies to both built-in and OpenAI-compatible
   * providers. Evaluated before `disabled_providers`.
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
  if (configured.length === 0) {
    throw new ConfigError(['at least one provider must be configured']);
  }

  const issues: string[] = [];

  // Validate each provider entry. Known providers are checked against their
  // required keys; any other key is a generic OpenAI-compatible endpoint and
  // must supply a non-empty `baseURL` (this is what distinguishes a deliberate
  // custom endpoint from a typo of a built-in provider name). Instance
  // passthrough (config shape #2) is skipped — the user already built it.
  for (const [name, cfg] of Object.entries(input.providers)) {
    if (cfg == null) {
      continue;
    }
    if (isProviderInstance(cfg)) {
      continue;
    }
    if (typeof cfg !== 'object') {
      issues.push(`providers.${name} must be a config object`);
      continue;
    }

    const def = providers[name as ProviderName];
    if (!def) {
      // Generic OpenAI-compatible endpoint.
      if (name.includes('/')) {
        issues.push(`providers.${name} name must not contain "/"`);
      }
      const baseURL = (cfg as Record<string, unknown>).baseURL;
      if (typeof baseURL !== 'string' || baseURL.length === 0) {
        issues.push(
          `providers.${name}.baseURL must be a non-empty string (custom OpenAI-compatible providers require a baseURL)`,
        );
      }
      continue;
    }

    const requiredKeys = 'requiredKeys' in def ? def.requiredKeys : undefined;
    if (!requiredKeys || requiredKeys.length === 0) {
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

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }
  return input;
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
export function defineConfig<const P extends ProvidersInput<P>>(
  config: Omit<GatewayConfig, 'providers'> & { providers: P },
): GatewayConfig {
  return config as GatewayConfig;
}
