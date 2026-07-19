import { describe, expect, it } from 'vitest';
import {
  forwardLanguageParams,
  parsePromptCachingOptions,
  snakeToCamel,
  CACHE_DROP_PROVIDERS,
} from './params.js';

describe('parsePromptCachingOptions', () => {
  it('returns undefined when no caching options present', () => {
    expect(parsePromptCachingOptions({})).toBeUndefined();
  });

  it('parses prompt_cache_key', () => {
    const result = parsePromptCachingOptions({ prompt_cache_key: 'my-key' });
    expect(result).toEqual({ prompt_cache_key: 'my-key' });
  });

  it('parses prompt_cache_retention', () => {
    const result = parsePromptCachingOptions({ prompt_cache_retention: '5m' });
    expect(result).toEqual({ prompt_cache_retention: '5m' });
  });

  it('parses cache_control object', () => {
    const result = parsePromptCachingOptions({ cache_control: { type: 'ephemeral' } });
    expect(result).toEqual({ cache_control: { type: 'ephemeral' } });
  });

  it('parses all fields together', () => {
    const result = parsePromptCachingOptions({
      prompt_cache_key: 'key-1',
      prompt_cache_retention: '1h',
      cache_control: { type: 'ephemeral', ttl: '5m' },
    });
    expect(result).toEqual({
      prompt_cache_key: 'key-1',
      prompt_cache_retention: '1h',
      cache_control: { type: 'ephemeral', ttl: '5m' },
    });
  });

  it('ignores empty strings', () => {
    expect(parsePromptCachingOptions({ prompt_cache_key: '' })).toBeUndefined();
  });

  it('ignores non-string prompt_cache_key', () => {
    expect(parsePromptCachingOptions({ prompt_cache_key: 123 })).toBeUndefined();
  });
});

describe('forwardLanguageParams', () => {
  it('merges unknown namespace into provider with snake→camel conversion', () => {
    const opts: Record<string, Record<string, unknown>> = {
      unknown: { cache_control: { type: 'ephemeral' }, prompt_cache_key: 'k1' },
    };
    forwardLanguageParams(opts, 'anthropic');
    expect(opts['anthropic']).toEqual({
      cacheControl: { type: 'ephemeral' },
      promptCacheKey: 'k1',
    });
    expect(opts['unknown']).toBeUndefined();
  });

  it('does not overwrite existing provider-namespaced values', () => {
    const opts: Record<string, Record<string, unknown>> = {
      anthropic: { cacheControl: { type: 'persistent' } },
      unknown: { cache_control: { type: 'ephemeral' } },
    };
    forwardLanguageParams(opts, 'anthropic');
    expect(opts['anthropic']['cacheControl']).toEqual({ type: 'persistent' });
  });

  it('drops unknown namespace for bedrock providers', () => {
    const opts: Record<string, Record<string, unknown>> = {
      unknown: { cache_control: { type: 'ephemeral' } },
    };
    forwardLanguageParams(opts, 'amazon-bedrock');
    expect(opts['amazon-bedrock']).toBeUndefined();
    expect(opts['unknown']).toBeUndefined();
  });

  it('is a no-op when no unknown namespace exists', () => {
    const opts: Record<string, Record<string, unknown>> = {
      anthropic: { thinking: { type: 'enabled' } },
    };
    forwardLanguageParams(opts, 'anthropic');
    expect(opts['anthropic']).toEqual({ thinking: { type: 'enabled' } });
  });
});

describe('CACHE_DROP_PROVIDERS', () => {
  it('contains amazon-bedrock', () => {
    expect(CACHE_DROP_PROVIDERS.has('amazon-bedrock')).toBe(true);
  });
});

describe('snakeToCamel', () => {
  it('converts cache_control → cacheControl', () => {
    expect(snakeToCamel('cache_control')).toBe('cacheControl');
  });

  it('converts prompt_cache_key → promptCacheKey', () => {
    expect(snakeToCamel('prompt_cache_key')).toBe('promptCacheKey');
  });
});
