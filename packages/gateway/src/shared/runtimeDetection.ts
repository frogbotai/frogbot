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
