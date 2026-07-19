// Config file loader + idempotent merge.
//
// Handles `gateway.config.{ts,js,mjs,cjs,json}` files, merges them on top of
// env-derived config, and applies `enabled_providers` / `disabled_providers`
// allow/deny lists.
//
// Idempotent: a config that has already been through `finalizeConfig` is
// returned unchanged. Detected via the `Symbol.for('frogbotai.gateway.parsed')`
// marker (hebo `kParsed` pattern).

import { pathToFileURL } from 'node:url';
import { extname, isAbsolute, resolve } from 'node:path';

import { ConfigError } from '../errors/gatewayError.js';
import { parseGatewayConfig, type GatewayConfig } from './schema.js';
import { PROVIDER_NAMES, type ProviderConfigMap } from '../providers/registry.js';
import { interpolateConfigText } from './variable.js';

/** Symbol placed on the parsed config object so we can detect and skip re-parsing. */
export const kParsed: unique symbol = Symbol.for('frogbotai.gateway.parsed') as never;

type ParsedMarked = GatewayConfig & { [kParsed]?: true };

// ---------------------------------------------------------------------------
// File loading
// ---------------------------------------------------------------------------

const SUPPORTED_EXTS = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json']);

/**
 * Load a gateway config from a file path. Supports `.ts` (requires a runtime
 * that handles TypeScript — Bun, Deno, ts-node, or a `tsx`-registered Node),
 * `.js` / `.mjs` / `.cjs`, and `.json`.
 *
 * The file may export the config as `default` or as a named `config` export.
 * A function export is invoked (may return a Promise) to allow lazy secrets.
 */
export async function loadConfigFile(path: string): Promise<GatewayConfig> {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  const ext = extname(abs).toLowerCase();
  if (!SUPPORTED_EXTS.has(ext)) {
    throw new ConfigError([`unsupported config extension "${ext}"; expected one of ${[...SUPPORTED_EXTS].join(', ')}`]);
  }

  let mod: Record<string, unknown>;
  try {
    if (ext === '.json') {
      const fs = await import('node:fs/promises');
      const raw = await interpolateConfigText({
        text: await fs.readFile(abs, 'utf8'),
        source: abs,
      });
      mod = { default: JSON.parse(raw) };
    } else {
      mod = (await import(pathToFileURL(abs).href)) as Record<string, unknown>;
    }
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    if ((ext === '.ts' || ext === '.mts' || ext === '.cts') && /Unknown file extension|Cannot find/.test(cause)) {
      throw new ConfigError([
        `failed to load TypeScript config "${abs}" — the current runtime cannot import .ts directly.`,
        `use Bun, or pre-register a TS loader (e.g. \`node --import tsx <entry>\`), or compile to .js`,
      ]);
    }
    throw new ConfigError([`failed to load config "${abs}": ${cause}`]);
  }

  const raw = pickExport(mod, abs);
  const resolved = typeof raw === 'function' ? await (raw as () => unknown | Promise<unknown>)() : raw;
  if (!isRecord(resolved)) {
    throw new ConfigError([`config file "${abs}" must export a GatewayConfig object (default or named "config")`]);
  }
  return resolved as GatewayConfig;
}

function pickExport(mod: Record<string, unknown>, abs: string): unknown {
  if ('default' in mod && mod.default != null) return mod.default;
  if ('config' in mod && mod.config != null) return mod.config;
  throw new ConfigError([`config file "${abs}" exports neither a "default" nor a named "config" export`]);
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Merge two GatewayConfigs. `overlay` wins on any conflict; provider entries
 * are shallow-merged so an overlay entry with a partial config extends the
 * base rather than replacing it entirely.
 *
 * Order intended for callers: `mergeConfigs(defaults, mergeConfigs(env, file))`.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function mergeConfigs(base: GatewayConfig, overlay: GatewayConfig): GatewayConfig {
  const providers: ProviderConfigMap = { ...base.providers };
  for (const [name, cfg] of Object.entries(overlay.providers ?? {})) {
    if (cfg == null || UNSAFE_KEYS.has(name)) {
      continue;
    }
    const existing = (providers as Record<string, unknown>)[name];
    (providers as Record<string, unknown>)[name] =
      existing && typeof existing === 'object' && typeof cfg === 'object'
        ? { ...(existing), ...(cfg as object) }
        : cfg;
  }

  const openaiCompatible = dedupeByName([...(base.openaiCompatible ?? []), ...(overlay.openaiCompatible ?? [])]);

  return {
    providers,
    ...(openaiCompatible.length > 0 ? { openaiCompatible } : {}),
    enabled_providers: overlay.enabled_providers ?? base.enabled_providers,
    disabled_providers: overlay.disabled_providers ?? base.disabled_providers,
    maxBodyBytes: overlay.maxBodyBytes ?? base.maxBodyBytes,
    upstreamTimeoutMs: overlay.upstreamTimeoutMs ?? base.upstreamTimeoutMs,
    hooks: overlay.hooks ?? base.hooks,
    logger: shallowMerge(base.logger, overlay.logger),
    tracing: shallowMerge(base.tracing, overlay.tracing),
    signalLevel: overlay.signalLevel ?? base.signalLevel,
  };
}

// One-level merge: overlay's own keys replace base's. Not recursive — nested
// sub-objects are replaced wholesale, not merged. Callers only pass flat shapes
// (LoggerOptions, TracingOptions).
function shallowMerge<T>(base: T | undefined, overlay: T | undefined): T | undefined {
  if (overlay == null) return base;
  if (!isPlainObject(base) || !isPlainObject(overlay)) return overlay;
  return { ...base, ...overlay };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

/** Non-null, non-array object. Shared shape guard for pre-validation layer checks. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function dedupeByName<T extends { name: string }>(entries: T[]): T[] {
  const map = new Map<string, T>();
  for (const e of entries) {
    map.set(e.name, e);
  } // later wins
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Allow/deny filtering
// ---------------------------------------------------------------------------

function applyAllowDeny(config: GatewayConfig): GatewayConfig {
  const enabled = config.enabled_providers?.length ? new Set(config.enabled_providers) : null;
  const disabled = new Set(config.disabled_providers ?? []);

  const validNames = new Set<string>(PROVIDER_NAMES);
  for (const name of Object.keys(config.providers ?? {})) {
    validNames.add(name);
  }
  for (const entry of config.openaiCompatible ?? []) {
    validNames.add(entry.name);
  }

  const issues: string[] = [];
  const enabledUnknown = [...(enabled ?? [])].filter((name) => !validNames.has(name));
  if (enabledUnknown.length > 0) {
    issues.push(`enabled_providers contains unknown provider names: ${enabledUnknown.join(', ')}`);
  }
  const disabledUnknown = [...disabled].filter((name) => !validNames.has(name));
  if (disabledUnknown.length > 0) {
    issues.push(`disabled_providers contains unknown provider names: ${disabledUnknown.join(', ')}`);
  }
  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  const keep = (name: string): boolean => {
    if (enabled && !enabled.has(name)) return false;
    if (disabled.has(name)) return false;
    return true;
  };

  const providers: ProviderConfigMap = {};
  for (const [name, cfg] of Object.entries(config.providers)) {
    if (cfg != null && keep(name)) {
      (providers as Record<string, unknown>)[name] = cfg;
    }
  }
  const openaiCompatible = (config.openaiCompatible ?? []).filter((e) => keep(e.name));

  const rest = { ...config };
  delete rest.enabled_providers;
  delete rest.disabled_providers;
  return {
    ...rest,
    providers,
    openaiCompatible: openaiCompatible.length > 0 ? openaiCompatible : undefined,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Finalize a config: apply allow/deny lists, validate, and mark idempotent.
 * Calling this on an already-finalized config returns it unchanged.
 */
export function finalizeConfig(config: GatewayConfig): GatewayConfig {
  const marked = config as ParsedMarked;
  if (marked[kParsed] === true) return config;
  const filtered = applyAllowDeny(config);
  const validated = parseGatewayConfig(filtered) as ParsedMarked;
  Object.defineProperty(validated, kParsed, { value: true, enumerable: false });
  return validated;
}
