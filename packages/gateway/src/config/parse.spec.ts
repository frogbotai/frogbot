import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { finalizeConfig, kParsed, loadConfigFile, mergeConfigs } from './parse.js';
import { ConfigError } from '../errors/gatewayError.js';

const scratch = () => mkdtempSync(join(tmpdir(), 'frogbotai-gateway-config-'));

describe('mergeConfigs', () => {
  it('overlay providers win, shallow-merge partial entries', () => {
    const base = { providers: { openai: { apiKey: 'env' } } } as const;
    const overlay = { providers: { openai: { baseURL: 'https://x' } } } as const;
    const merged = mergeConfigs(base, overlay);
    expect(merged.providers.openai).toEqual({ apiKey: 'env', baseURL: 'https://x' });
  });

  it('shallow-merges openai-compatible providers across layers — later wins', () => {
    const merged = mergeConfigs(
      { providers: { ollama: { baseURL: 'http://a', apiKey: 'k' } } },
      { providers: { ollama: { baseURL: 'http://b' } } },
    );
    expect(merged.providers.ollama).toEqual({ baseURL: 'http://b', apiKey: 'k' });
  });

  it('overlay enabled/disabled_providers replace base', () => {
    const merged = mergeConfigs(
      { providers: {}, enabled_providers: ['a'] },
      { providers: {}, enabled_providers: ['b'] },
    );
    expect(merged.enabled_providers).toEqual(['b']);
  });

  it('skips __proto__/constructor/prototype provider keys', () => {
    const overlay = { providers: JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"x": 1}, "openai": {"apiKey": "k"}}') };
    const merged = mergeConfigs({ providers: {} }, overlay);
    expect(Object.keys(merged.providers)).toEqual(['openai']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(merged.providers)).toBe(Object.prototype);
  });

  it('shallow-merges logger/tracing — overlay wins, base preserved when overlay undefined (P2-D6a guard)', () => {
    const merged = mergeConfigs(
      { providers: {}, logger: { level: 'info' }, tracing: { endpoint: 'http://base' } },
      { providers: {}, logger: { level: 'debug' } },
    );
    expect(merged.logger).toEqual({ level: 'debug' });
    expect(merged.tracing).toEqual({ endpoint: 'http://base' });
  });
});

describe('finalizeConfig', () => {
  it('applies enabled_providers allow list', () => {
    const out = finalizeConfig({
      providers: { openai: { apiKey: 'x' }, groq: { apiKey: 'y' } },
      enabled_providers: ['openai'],
    });
    expect(Object.keys(out.providers)).toEqual(['openai']);
  });

  it('applies disabled_providers deny list', () => {
    const out = finalizeConfig({
      providers: { openai: { apiKey: 'x' }, groq: { apiKey: 'y' } },
      disabled_providers: ['groq'],
    });
    expect(Object.keys(out.providers)).toEqual(['openai']);
  });

  it('filters openai-compatible providers by allow/deny', () => {
    const out = finalizeConfig({
      providers: {
        ollama: { baseURL: 'http://a' },
        lmstudio: { baseURL: 'http://b' },
      },
      disabled_providers: ['lmstudio'],
    });
    expect(Object.keys(out.providers)).toEqual(['ollama']);
  });

  it('preserves non-provider keys and drops allow/deny lists', () => {
    const hooks = {};
    const out = finalizeConfig({
      providers: { openai: { apiKey: 'x' }, groq: { apiKey: 'y' } },
      disabled_providers: ['groq'],
      maxBodyBytes: 1024,
      hooks,
      logger: { level: 'debug' },
      tracing: { endpoint: 'http://otel.local' },
      signalLevel: 'full',
    });
    expect(Object.keys(out.providers)).toEqual(['openai']);
    expect(out.maxBodyBytes).toBe(1024);
    expect(out.hooks).toBe(hooks);
    expect(out.logger).toEqual({ level: 'debug' });
    expect(out.tracing).toEqual({ endpoint: 'http://otel.local' });
    expect(out.signalLevel).toBe('full');
    expect(out.enabled_providers).toBeUndefined();
    expect(out.disabled_providers).toBeUndefined();
  });

  it('is idempotent — kParsed marker short-circuits', () => {
    const first = finalizeConfig({ providers: { openai: { apiKey: 'x' } } });
    expect((first as unknown as Record<symbol, unknown>)[kParsed]).toBe(true);
    const second = finalizeConfig(first);
    expect(second).toBe(first);
  });

  it('throws when allow list produces empty registry', () => {
    expect(() =>
      finalizeConfig({
        providers: { openai: { apiKey: 'x' } },
        enabled_providers: ['groq'],
      }),
    ).toThrow(ConfigError);
  });
});

describe('loadConfigFile', () => {
  it('loads JSON config', async () => {
    const dir = scratch();
    const p = join(dir, 'gateway.config.json');
    writeFileSync(p, JSON.stringify({ providers: { openai: { apiKey: 'json' } } }));
    const cfg = await loadConfigFile(p);
    expect(cfg.providers.openai).toEqual({ apiKey: 'json' });
  });

  it('interpolates env and file variables before JSON parse', async () => {
    const dir = scratch();
    const secret = join(dir, 'secret.txt');
    const p = join(dir, 'gateway.config.json');
    process.env.FROGBOTAI_TEST_BASE_URL = 'https://api.example.test/v1';
    writeFileSync(secret, 'from-file\n');
    writeFileSync(p, JSON.stringify({ providers: { openai: { apiKey: '{file:./secret.txt}', baseURL: '{env:FROGBOTAI_TEST_BASE_URL}' } } }));
    const cfg = await loadConfigFile(p);
    expect(cfg.providers.openai).toEqual({ apiKey: 'from-file', baseURL: 'https://api.example.test/v1' });
  });

  it('loads .mjs default export', async () => {
    const dir = scratch();
    const p = join(dir, 'gateway.config.mjs');
    writeFileSync(p, `export default { providers: { openai: { apiKey: 'mjs' } } }`);
    const cfg = await loadConfigFile(p);
    expect(cfg.providers.openai).toEqual({ apiKey: 'mjs' });
  });

  it('invokes a function export', async () => {
    const dir = scratch();
    const p = join(dir, 'gateway.config.mjs');
    writeFileSync(p, `export default () => ({ providers: { openai: { apiKey: 'fn' } } })`);
    const cfg = await loadConfigFile(p);
    expect(cfg.providers.openai).toEqual({ apiKey: 'fn' });
  });

  it('rejects unsupported extension', async () => {
    await expect(loadConfigFile('/tmp/foo.yaml')).rejects.toThrow(ConfigError);
  });

  it('throws when a module exports neither default nor config (P2-D6d)', async () => {
    const dir = scratch();
    const p = join(dir, 'gateway.config.mjs');
    writeFileSync(p, `export const foo = { providers: { openai: { apiKey: 'x' } } };`);
    await expect(loadConfigFile(p)).rejects.toThrow(/neither a "default" nor a named "config" export/);
  });

  it('rejects an array default export (P2-D6c)', async () => {
    const dir = scratch();
    const p = join(dir, 'gateway.config.json');
    writeFileSync(p, JSON.stringify([{ providers: {} }]));
    await expect(loadConfigFile(p)).rejects.toThrow(/must export a GatewayConfig object/);
  });
});
