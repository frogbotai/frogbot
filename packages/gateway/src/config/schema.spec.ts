import { describe, expect, it } from 'vitest';

import { parseGatewayConfig } from './schema.js';
import { ConfigError } from '../errors/gatewayError.js';

describe('parseGatewayConfig — openaiCompatible', () => {
  it('accepts openai-compatible-only config (no other providers)', () => {
    const result = parseGatewayConfig({
      providers: {},
      openaiCompatible: [{ name: 'ollama', baseURL: 'http://localhost:11434/v1' }],
    });
    expect(result.openaiCompatible?.[0]?.name).toBe('ollama');
  });

  it('rejects names shadowing built-in providers', () => {
    expect(() =>
      parseGatewayConfig({
        providers: {},
        openaiCompatible: [{ name: 'openai', baseURL: 'https://x/v1' }],
      }),
    ).toThrow(ConfigError);
  });

  it('rejects duplicate names', () => {
    expect(() =>
      parseGatewayConfig({
        providers: {},
        openaiCompatible: [
          { name: 'a', baseURL: 'https://x/v1' },
          { name: 'a', baseURL: 'https://y/v1' },
        ],
      }),
    ).toThrow(ConfigError);
  });

  it('rejects entries missing baseURL', () => {
    expect(() =>
      parseGatewayConfig({
        providers: {},
        openaiCompatible: [{ name: 'x', baseURL: '' }],
      }),
    ).toThrow(ConfigError);
  });

  it('rejects names containing "/"', () => {
    expect(() =>
      parseGatewayConfig({
        providers: {},
        openaiCompatible: [{ name: 'a/b', baseURL: 'https://x/v1' }],
      }),
    ).toThrow(ConfigError);
  });

  it('rejects when both providers and openaiCompatible are empty', () => {
    expect(() => parseGatewayConfig({ providers: {} })).toThrow(ConfigError);
  });
});
