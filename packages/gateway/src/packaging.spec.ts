import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as {
  bin?: Record<string, string>;
  engines?: Record<string, string>;
  publishConfig?: { access?: string };
  repository?: { type?: string; url?: string; directory?: string };
};

describe('G104 — publishing readiness metadata', () => {
  it('exposes the bin command as frogbotai-gateway (npm normalizes scoped keys to basename)', () => {
    expect(pkg.bin).toEqual({ 'frogbotai-gateway': './dist/cli/index.js' });
  });

  it('declares Node >=20 in engines (AbortSignal.any, @ai-sdk)', () => {
    expect(pkg.engines?.node).toBe('>=20.0.0');
  });

  it('sets publishConfig.access to public so the scoped package publishes publicly', () => {
    expect(pkg.publishConfig?.access).toBe('public');
  });

  it('declares repository.url for npm provenance signing', () => {
    expect(pkg.repository?.type).toBe('git');
    expect(pkg.repository?.url).toBe('git+https://github.com/frogbotai/firmware.git');
    expect(pkg.repository?.directory).toBe('packages/gateway');
  });
});
