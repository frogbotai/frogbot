// WinterCG-safe runtime detection (G46).
//
// The gateway's request/error/stream paths must not touch Node-only APIs:
// strict WinterCG runtimes (Cloudflare Workers without `nodejs_compat`, Deno,
// edge runtimes) throw `ReferenceError: process is not defined` on the first
// bare `process.env` read. Every production/env check reachable from a request
// goes through this module instead. CLI-only paths (`cli/`) and the config
// layer are Node-by-design and may read `process.env` directly.

/**
 * Read an environment variable without assuming a Node runtime. Falls back to
 * a same-named `globalThis` string (the WinterCG convention used by the AI SDK,
 * e.g. `globalThis.AI_SDK_LOG_WARNINGS`) when `process` is unavailable.
 */
export function readEnv(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name];
  }
  const value = (globalThis as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

/** Guarded `NODE_ENV === 'production'` check, safe on non-Node runtimes. */
export function isProduction(): boolean {
  return readEnv('NODE_ENV') === 'production';
}
