// Catalog unit tests — defineModelCatalog, presetFor, supportsOperation.

import { describe, expect, it } from 'vitest';

import {
  defineModelCatalog,
  presetFor,
  supportsOperation,
  type ModelCatalogEntry,
} from './catalog.js';

// ---------------------------------------------------------------------------
// presetFor
// ---------------------------------------------------------------------------

describe('presetFor', () => {
  it('creates a ModelCatalogEntry with the given id and base', () => {
    type TestIds = 'openai/gpt-4o' | 'openai/gpt-4o-mini';
    const preset = presetFor<TestIds>();
    const entry = preset('openai/gpt-4o', {
      name: 'GPT-4o',
      modalities: { input: ['text', 'image'], output: ['text'] },
      operations: ['chat.completions'],
      capabilities: { toolCalling: true, vision: true, streaming: true },
      context: { input: 128000, output: 16384 },
      providers: ['openai'],
    });

    expect(entry.id).toBe('openai/gpt-4o');
    expect(entry.name).toBe('GPT-4o');
    expect(entry.modalities.input).toContain('image');
    expect(entry.capabilities.vision).toBe(true);
    expect(entry.context.input).toBe(128000);
  });

  it('includes optional fields when provided', () => {
    const preset = presetFor<'anthropic/claude-4-sonnet'>();
    const entry = preset('anthropic/claude-4-sonnet', {
      name: 'Claude 4 Sonnet',
      created: '2025-05-14',
      knowledge: '2025-04-01',
      modalities: { input: ['text', 'image'], output: ['text'] },
      operations: ['chat.completions'],
      capabilities: { reasoning: true, promptCaching: true },
      context: { input: 200000, output: 8192 },
      providers: ['anthropic', 'amazon-bedrock'],
    });

    expect(entry.created).toBe('2025-05-14');
    expect(entry.knowledge).toBe('2025-04-01');
    expect(entry.providers).toEqual(['anthropic', 'amazon-bedrock']);
  });
});

// ---------------------------------------------------------------------------
// defineModelCatalog
// ---------------------------------------------------------------------------

describe('defineModelCatalog', () => {
  const entry1: ModelCatalogEntry = {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    modalities: { input: ['text'], output: ['text'] },
    operations: ['chat.completions'],
    capabilities: {},
    context: { input: 128000, output: 16384 },
    providers: ['openai'],
  };

  const entry2: ModelCatalogEntry = {
    id: 'anthropic/claude-4-sonnet',
    name: 'Claude 4 Sonnet',
    modalities: { input: ['text'], output: ['text'] },
    operations: ['chat.completions'],
    capabilities: {},
    context: { input: 200000, output: 8192 },
    providers: ['anthropic'],
  };

  it('builds a Map from entries', () => {
    const catalog = defineModelCatalog(entry1, entry2);
    expect(catalog.size).toBe(2);
    expect(catalog.get('openai/gpt-4o')).toBe(entry1);
    expect(catalog.get('anthropic/claude-4-sonnet')).toBe(entry2);
  });

  it('returns empty Map when no entries', () => {
    const catalog = defineModelCatalog();
    expect(catalog.size).toBe(0);
  });

  it('throws on duplicate IDs', () => {
    expect(() => defineModelCatalog(entry1, entry1)).toThrow(/Duplicate model catalog entry/);
  });
});

// ---------------------------------------------------------------------------
// supportsOperation
// ---------------------------------------------------------------------------

describe('supportsOperation', () => {
  const entry: ModelCatalogEntry = {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    modalities: { input: ['text'], output: ['text'] },
    operations: ['chat.completions', 'embeddings'],
    capabilities: {},
    context: { input: 128000, output: 16384 },
    providers: ['openai'],
  };

  it('returns true for supported operations', () => {
    expect(supportsOperation(entry, 'chat.completions')).toBe(true);
    expect(supportsOperation(entry, 'embeddings')).toBe(true);
  });

  it('returns false for unsupported operations', () => {
    expect(supportsOperation(entry, 'images.generations')).toBe(false);
    expect(supportsOperation(entry, 'audio.speech')).toBe(false);
  });
});
