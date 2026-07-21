import { describe, expect, it } from 'vitest';

import { defineConfig, parseGatewayConfig } from './schema.js';
import { ConfigError } from '../errors/gatewayError.js';

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
