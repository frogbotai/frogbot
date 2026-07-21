// Registry unit tests — resolveProvider, buildProviderRegistry.

import { describe, expect, it } from 'vitest';
import { MockProviderV4 } from 'ai/test';

import {
  resolveProvider,
  buildProviderRegistry,
  PROVIDER_NAMES,
  providers,
  type ProviderRegistry,
} from './registry.js';
import {
  ModelIdError,
  ModelNotFoundError,
  ModelUnsupportedOperationError,
  NoProvidersError,
  ProviderNotConfiguredError,
} from '../errors/gatewayError.js';
import { defineModelCatalog, presetFor } from './catalog.js';

// ---------------------------------------------------------------------------
// resolveProvider
// ---------------------------------------------------------------------------

describe('resolveProvider', () => {
  const mockProvider = new MockProviderV4();
  const registry = { openai: mockProvider } as unknown as ProviderRegistry;

  it('resolves a valid provider/model ID', () => {
    const result = resolveProvider({
      modelId: 'openai/gpt-4o',
      operation: 'chat.completions',
      providers: registry,
    });
    expect(result.providerName).toBe('openai');
    expect(result.modelName).toBe('gpt-4o');
    expect(result.instance).toBe(mockProvider);
  });

  it('splits on first slash only (multi-slash model IDs)', () => {
    const result = resolveProvider({
      modelId: 'openai/ft:gpt-4o-mini:org::abc',
      operation: 'chat.completions',
      providers: registry,
    });
    expect(result.providerName).toBe('openai');
    expect(result.modelName).toBe('ft:gpt-4o-mini:org::abc');
  });

  it('throws NoProvidersError when registry is empty', () => {
    expect(() =>
      resolveProvider({
        modelId: 'openai/gpt-4o',
        operation: 'chat.completions',
        providers: {},
      }),
    ).toThrow(NoProvidersError);
  });

  it('throws ModelIdError for empty model ID', () => {
    expect(() =>
      resolveProvider({
        modelId: '',
        operation: 'chat.completions',
        providers: registry,
      }),
    ).toThrow(ModelIdError);
  });

  it('throws ModelIdError for bare model name (no slash)', () => {
    expect(() =>
      resolveProvider({
        modelId: 'gpt-4o',
        operation: 'chat.completions',
        providers: registry,
      }),
    ).toThrow(ModelIdError);
  });

  it('throws ModelIdError for trailing slash', () => {
    expect(() =>
      resolveProvider({
        modelId: 'openai/',
        operation: 'chat.completions',
        providers: registry,
      }),
    ).toThrow(ModelIdError);
  });

  it('throws ModelIdError for leading slash', () => {
    expect(() =>
      resolveProvider({
        modelId: '/gpt-4o',
        operation: 'chat.completions',
        providers: registry,
      }),
    ).toThrow(ModelIdError);
  });

  it('throws ProviderNotConfiguredError for known but unconfigured provider', () => {
    expect(() =>
      resolveProvider({
        modelId: 'groq/llama-3.3-70b-versatile',
        operation: 'chat.completions',
        providers: registry,
      }),
    ).toThrow(ProviderNotConfiguredError);
  });

  it('throws ModelNotFoundError for completely unknown provider', () => {
    expect(() =>
      resolveProvider({
        modelId: 'unknown-provider/some-model',
        operation: 'chat.completions',
        providers: registry,
      }),
    ).toThrow(ModelNotFoundError);
  });

  // G36.1
  it('throws ModelNotFoundError for prototype key "constructor" as provider', () => {
    expect(() =>
      resolveProvider({
        modelId: 'constructor/x',
        operation: 'chat.completions',
        providers: registry,
      }),
    ).toThrow(ModelNotFoundError);
  });

  // G36.2
  it('throws ModelNotFoundError for prototype key "__proto__" as provider', () => {
    expect(() =>
      resolveProvider({
        modelId: '__proto__/x',
        operation: 'chat.completions',
        providers: registry,
      }),
    ).toThrow(ModelNotFoundError);
  });

  // G36.3
  it('throws ModelNotFoundError for prototype key "toString" as provider', () => {
    expect(() =>
      resolveProvider({
        modelId: 'toString/x',
        operation: 'chat.completions',
        providers: registry,
      }),
    ).toThrow(ModelNotFoundError);
  });

  // G36.3 (companion prototype keys)
  it('throws ModelNotFoundError for "hasOwnProperty" and "valueOf" as provider', () => {
    for (const key of ['hasOwnProperty', 'valueOf']) {
      expect(() =>
        resolveProvider({
          modelId: `${key}/x`,
          operation: 'chat.completions',
          providers: registry,
        }),
      ).toThrow(ModelNotFoundError);
    }
  });

  it('validates operation against catalog when provided', () => {
    type TestIds = 'openai/text-embedding-3-small';
    const preset = presetFor<TestIds>();
    const entry = preset('openai/text-embedding-3-small', {
      name: 'Text Embedding 3 Small',
      modalities: { input: ['text'], output: ['embedding'] },
      operations: ['embeddings'],
      capabilities: {},
      context: { input: 8192, output: 0 },
      providers: ['openai'],
    });
    const catalog = defineModelCatalog(entry);

    expect(() =>
      resolveProvider({
        modelId: 'openai/text-embedding-3-small',
        operation: 'chat.completions',
        providers: registry,
        models: catalog,
      }),
    ).toThrow(ModelUnsupportedOperationError);
  });

  it('allows operations not in catalog (unknown models pass through)', () => {
    const catalog = defineModelCatalog();
    // gpt-4o is NOT in the catalog — should pass through
    const result = resolveProvider({
      modelId: 'openai/gpt-4o',
      operation: 'chat.completions',
      providers: registry,
      models: catalog,
    });
    expect(result.providerName).toBe('openai');
  });
});

// ---------------------------------------------------------------------------
// buildProviderRegistry
// ---------------------------------------------------------------------------

describe('buildProviderRegistry', () => {
  it('builds registry from provider configs', () => {
    const registry = buildProviderRegistry({
      openai: { apiKey: 'sk-test' },
    });
    expect(registry.openai).toBeDefined();
  });

  it('builds an unknown provider key as an openai-compatible endpoint', () => {
    const registry = buildProviderRegistry({
      openai: { apiKey: 'sk-test' },
      ollama: { baseURL: 'http://localhost:11434/v1' },
    });
    expect(registry.openai).toBeDefined();
    expect((registry as Record<string, unknown>)['ollama']).toBeDefined();
  });

  it('skips providers with undefined config', () => {
    const registry = buildProviderRegistry({
      openai: { apiKey: 'sk-test' },
      groq: undefined,
    });
    expect(registry.openai).toBeDefined();
    expect(registry.groq).toBeUndefined();
  });

  // G36.4
  it('does not mutate Object.prototype for a hostile openai-compatible key', () => {
    const before = Object.getOwnPropertyDescriptor(Object.prototype, '__proto__');
    // A JSON-sourced config can carry a genuine own `__proto__` key.
    const hostile = JSON.parse('{"__proto__": {"baseURL": "http://localhost:11434/v1"}}') as Record<
      string,
      unknown
    >;
    const registry = buildProviderRegistry(hostile);
    // Object.prototype's native __proto__ accessor is untouched (still an accessor,
    // not a data property holding the provider instance).
    expect(Object.getOwnPropertyDescriptor(Object.prototype, '__proto__')).toEqual(before);
    expect(({} as Record<string, unknown>)['languageModel']).toBeUndefined();
    // The entry lands as an own property of the registry, not on the prototype.
    expect(Object.hasOwn(registry, '__proto__')).toBe(true);
  });

  // G36.5
  it('builds a null-prototype registry so prototype keys resolve to undefined', () => {
    const registry = buildProviderRegistry({ openai: { apiKey: 'sk-test' } });
    expect(Object.getPrototypeOf(registry)).toBe(null);
    expect((registry as Record<string, unknown>)['constructor']).toBeUndefined();
    expect((registry as Record<string, unknown>)['toString']).toBeUndefined();
  });

  // G80 — config value shape #2: pre-built provider instance used as-is.
  it('passes a pre-built provider instance through as-is (no rebuild)', () => {
    const prebuilt = new MockProviderV4();
    const registry = buildProviderRegistry({ openai: prebuilt });
    expect(registry.openai).toBe(prebuilt);
  });

  // G80 — instance passthrough coexists with shorthand-built providers.
  it('mixes pre-built instances and shorthand configs in one registry', () => {
    const prebuilt = new MockProviderV4();
    const registry = buildProviderRegistry({
      openai: prebuilt,
      groq: { apiKey: 'gsk-test' },
    });
    expect(registry.openai).toBe(prebuilt);
    expect(registry.groq).toBeDefined();
    expect(registry.groq).not.toBe(prebuilt);
  });
});

describe('provider table', () => {
  it('has 36 built-in providers', () => {
    expect(PROVIDER_NAMES.length).toBe(36);
  });

  it('providers table keys match PROVIDER_NAMES', () => {
    expect(Object.keys(providers).sort()).toEqual([...PROVIDER_NAMES].sort());
  });
});
