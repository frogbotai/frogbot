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
