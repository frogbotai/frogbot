// G46 — WinterCG leakage guards.
//
// Two protections: (1) unit coverage for the centralized runtime detection
// helpers, including the no-`process` (strict WinterCG) branch, and (2) a
// static scan asserting the request/error/stream path never regresses to
// `node:*` imports or bare `process.env` reads. The scan intentionally skips
// Node-by-design surfaces: the CLI, the config layer, observability setup
// (CLI/init-only), and test files.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isProduction, readEnv } from './runtimeDetection.js';

describe('readEnv / isProduction (G46)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('reads from process.env on Node', () => {
    vi.stubEnv('FROGBOT_G46_TEST', 'from-process');
    expect(readEnv('FROGBOT_G46_TEST')).toBe('from-process');
  });

  it('returns undefined for unset variables on Node', () => {
    expect(readEnv('FROGBOT_G46_UNSET')).toBeUndefined();
  });

  it('falls back to globalThis when process is undefined (strict WinterCG)', () => {
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('FROGBOT_G46_TEST', 'from-globalThis');
    expect(readEnv('FROGBOT_G46_TEST')).toBe('from-globalThis');
  });

  it('ignores non-string globals when process is undefined', () => {
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('FROGBOT_G46_TEST', 42);
    expect(readEnv('FROGBOT_G46_TEST')).toBeUndefined();
  });

  it('does not throw without process (no ReferenceError on strict runtimes)', () => {
    vi.stubGlobal('process', undefined);
    expect(() => readEnv('NODE_ENV')).not.toThrow();
    expect(() => isProduction()).not.toThrow();
  });

  it('isProduction reflects process.env.NODE_ENV on Node', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isProduction()).toBe(true);
    vi.stubEnv('NODE_ENV', 'development');
    expect(isProduction()).toBe(false);
  });

  it('isProduction reflects globalThis.NODE_ENV when process is undefined', () => {
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('NODE_ENV', 'production');
    expect(isProduction()).toBe(true);
  });

  it('isProduction is false when neither process nor a global is available', () => {
    vi.stubGlobal('process', undefined);
    expect(isProduction()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static scan — request-path source must stay WinterCG-clean
// ---------------------------------------------------------------------------

const srcDir = fileURLToPath(new URL('..', import.meta.url));

/** Request/error/stream-path surfaces that must stay WinterCG-safe. */
const scannedRoots = ['errors', 'shared', 'routes', 'providers'] as const;
const scannedFiles = ['observability/logger.ts', 'observability/tracing.ts'] as const;

/** Guarded reads live here; everything else must go through it. */
const exemptFiles = new Set(['shared/runtimeDetection.ts']);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('WinterCG surface scan (G46)', () => {
  const files = [
    ...scannedRoots.flatMap((root) => collectSourceFiles(join(srcDir, root))),
    ...scannedFiles.map((file) => join(srcDir, file)),
  ].filter((file) => !exemptFiles.has(file.slice(srcDir.length).replaceAll('\\', '/')));

  it('scans a non-trivial file set', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no node:* imports in the request path', () => {
    const offenders = files.filter((file) => /from\s+['"]node:/.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => file.slice(srcDir.length))).toEqual([]);
  });

  it('has no bare process.env reads in the request path', () => {
    const offenders = files.filter((file) => /\bprocess\.env\b/.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => file.slice(srcDir.length))).toEqual([]);
  });
});
