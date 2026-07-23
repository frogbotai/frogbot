import { afterEach, describe, expect, it, vi } from 'vitest';

import { defineConfig, parseGatewayConfig } from './schema.js';
import { ConfigError } from '../errors/gatewayError.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseGatewayConfig — provider credentials', () => {
  it('accepts an omitted API key when the provider credential env var is set', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-env');
    expect(parseGatewayConfig(JSON.parse('{"providers":{"openai":{}}}'))).toEqual({
      providers: { openai: {} },
    });
  });

  it('accepts an undefined API key when the provider credential env var is set', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-env');
    expect(
      parseGatewayConfig({ providers: { openai: { apiKey: undefined } } }),
    ).toEqual({ providers: { openai: { apiKey: undefined } } });
  });

  it('names the config key and provider-defined env var when credentials are omitted', () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', undefined);
    expect(() =>
      parseGatewayConfig(JSON.parse('{"providers":{"google":{}}}')),
    ).toThrow(/providers\.google\.apiKey.*GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace'],
  ])('rejects an %s explicit API key even when the env fallback exists', (apiKey) => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-env');
    expect(() => parseGatewayConfig({ providers: { openai: { apiKey } } })).toThrow(
      /providers\.openai\.apiKey.*OPENAI_API_KEY/,
    );
  });

  it('rejects an empty credential env var', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(() =>
      parseGatewayConfig(JSON.parse('{"providers":{"openai":{}}}')),
    ).toThrow(/providers\.openai\.apiKey.*OPENAI_API_KEY/);
  });

  it('uses Replicate apiToken and its provider-defined env var', () => {
    vi.stubEnv('REPLICATE_API_TOKEN', 'r8-env');
    expect(parseGatewayConfig(JSON.parse('{"providers":{"replicate":{}}}'))).toEqual({
      providers: { replicate: {} },
    });
  });

  it('validates each credential shape against its corresponding provider env var', () => {
    vi.stubEnv('KLINGAI_ACCESS_KEY', 'access-env');
    vi.stubEnv('KLINGAI_SECRET_KEY', undefined);
    expect(() =>
      parseGatewayConfig(JSON.parse('{"providers":{"klingai":{}}}')),
    ).toThrow(/providers\.klingai\.secretKey.*KLINGAI_SECRET_KEY/);
  });

  it('does not require static credentials for providers without requiredKeys', () => {
    expect(parseGatewayConfig({ providers: { 'amazon-bedrock': {} } })).toEqual({
      providers: { 'amazon-bedrock': {} },
    });
  });

  it('does not apply built-in credential rules to custom providers', () => {
    expect(
      parseGatewayConfig({ providers: { internal: { baseURL: 'https://models.test/v1' } } }),
    ).toEqual({ providers: { internal: { baseURL: 'https://models.test/v1' } } });
  });
});

describe('parseGatewayConfig — openai-compatible providers', () => {
  it('accepts an unknown key as an openai-compatible provider', () => {
    const result = parseGatewayConfig({
      providers: { ollama: { baseURL: 'http://localhost:11434/v1' } },
    });
    expect(result.providers.ollama).toEqual({ baseURL: 'http://localhost:11434/v1' });
  });

  it('accepts an openai-compatible provider alongside a built-in', () => {
    const result = parseGatewayConfig({
      providers: {
        openai: { apiKey: 'sk-test' },
        ollama: { baseURL: 'http://localhost:11434/v1' },
      },
    });
    expect(result.providers.ollama).toBeDefined();
    expect(result.providers.openai).toBeDefined();
  });

  it('rejects an unknown key missing baseURL', () => {
    expect(() =>
      parseGatewayConfig({ providers: { ollama: { apiKey: 'x' } as never } }),
    ).toThrow(ConfigError);
  });

  it('rejects an unknown key with empty baseURL', () => {
    expect(() =>
      parseGatewayConfig({ providers: { ollama: { baseURL: '' } } }),
    ).toThrow(ConfigError);
  });

  it('rejects an unknown key whose name contains "/"', () => {
    expect(() =>
      parseGatewayConfig({ providers: { 'a/b': { baseURL: 'https://x/v1' } } }),
    ).toThrow(ConfigError);
  });

  it('rejects when providers is empty', () => {
    expect(() => parseGatewayConfig({ providers: {} })).toThrow(ConfigError);
  });
});

describe('defineConfig — per-key provider typing', () => {
  it('accepts an optional environment API key', () => {
    const config = defineConfig({
      providers: { openai: { apiKey: process.env.OPENAI_API_KEY } },
    });
    expect(config.providers.openai).toEqual({ apiKey: process.env.OPENAI_API_KEY });
  });

  it('accepts an omitted provider API key', () => {
    expect(defineConfig({ providers: { openai: {} } }).providers.openai).toEqual({});
  });

  it('accepts a known provider config and an unknown openai-compatible key', () => {
    const config = defineConfig({
      providers: {
        openai: { apiKey: 'sk-test' },
        ollama: { baseURL: 'http://localhost:11434/v1' },
      },
    });
    expect(config.providers.ollama).toEqual({ baseURL: 'http://localhost:11434/v1' });
  });
});
