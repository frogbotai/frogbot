import { describe, expect, it } from 'vitest';

import {
  CACHE_FIELD_REJECTING_PROVIDERS,
  forwardLanguageParams,
  parsePromptCachingOptions,
  providerOptionsNamespace,
  snakeToCamel,
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
    const result = parsePromptCachingOptions({ prompt_cache_retention: 'in_memory' });
    expect(result).toEqual({ prompt_cache_retention: 'in_memory' });
  });

  it('parses cache_control object', () => {
    const result = parsePromptCachingOptions({ cache_control: { type: 'ephemeral' } });
    expect(result).toEqual({ cache_control: { type: 'ephemeral' } });
  });

  it('parses cached_content', () => {
    expect(parsePromptCachingOptions({ cached_content: 'cachedContents/abc123' })).toEqual({
      cached_content: 'cachedContents/abc123',
    });
  });

  it('prefers explicit cached_content over prompt_cache_key', () => {
    expect(parsePromptCachingOptions({
      prompt_cache_key: 'cachedContents/from-key',
      cached_content: 'cachedContents/explicit',
    })).toEqual({
      prompt_cache_key: 'cachedContents/from-key',
      cached_content: 'cachedContents/explicit',
    });
  });

  it('rejects non-string cached_content', () => {
    expect(() => parsePromptCachingOptions({ cached_content: 123 })).toThrow(expect.objectContaining({
      param: 'cached_content',
    }));
  });

  it('parses all fields together', () => {
    const result = parsePromptCachingOptions({
      prompt_cache_key: 'key-1',
      prompt_cache_retention: '24h',
      cache_control: { type: 'ephemeral', ttl: '5m' },
    });
    expect(result).toEqual({
      prompt_cache_key: 'key-1',
      prompt_cache_retention: '24h',
      cache_control: { type: 'ephemeral', ttl: '5m' },
    });
  });

  it('ignores empty strings', () => {
    expect(parsePromptCachingOptions({ prompt_cache_key: '' })).toBeUndefined();
  });

  it('ignores non-string prompt_cache_key', () => {
    expect(parsePromptCachingOptions({ prompt_cache_key: 123 })).toBeUndefined();
  });

  it('rejects invalid prompt_cache_retention', () => {
    expect(() => parsePromptCachingOptions({ prompt_cache_retention: '7d' })).toThrow(expect.objectContaining({
      message: expect.stringContaining("'in_memory' or '24h'"),
      param: 'prompt_cache_retention',
    }));
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

  it('drops bedrock cache fields and forwards non-cache fields', () => {
    const opts: Record<string, Record<string, unknown>> = {
      unknown: {
        cache_control: { type: 'ephemeral' },
        prompt_cache_key: 'key-1',
        prompt_cache_retention: '24h',
        service_tier: 'reserved',
      },
    };
    forwardLanguageParams(opts, 'amazon-bedrock');
    expect(opts['bedrock']).toEqual({ serviceTier: 'reserved' });
    expect(opts['unknown']).toBeUndefined();
  });

  it('forwards anthropic-aws cache fields to the Anthropic SDK namespace', () => {
    const opts: Record<string, Record<string, unknown>> = {
      unknown: { cache_control: { type: 'ephemeral' } },
    };
    forwardLanguageParams(opts, 'anthropic-aws');
    expect(opts['anthropic']).toEqual({ cacheControl: { type: 'ephemeral' } });
    expect(opts['unknown']).toBeUndefined();
  });

  it.each(['google', 'vertex'])('forwards cached_content to the %s SDK namespace', (providerName) => {
    const opts: Record<string, Record<string, unknown>> = {
      unknown: { cached_content: 'cachedContents/abc123' },
    };
    forwardLanguageParams(opts, providerName);
    expect(opts[providerName]).toEqual({ cachedContent: 'cachedContents/abc123' });
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

describe('providerOptionsNamespace', () => {
  it('maps amazon-bedrock to the SDK bedrock namespace', () => {
    expect(providerOptionsNamespace('amazon-bedrock')).toBe('bedrock');
  });

  it('maps anthropic-aws to the SDK anthropic namespace', () => {
    expect(providerOptionsNamespace('anthropic-aws')).toBe('anthropic');
  });
});

describe('CACHE_FIELD_REJECTING_PROVIDERS', () => {
  it('contains amazon-bedrock', () => {
    expect(CACHE_FIELD_REJECTING_PROVIDERS.has('amazon-bedrock')).toBe(true);
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
