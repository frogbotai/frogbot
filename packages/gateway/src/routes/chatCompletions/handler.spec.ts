import { MockLanguageModelV4, MockProviderV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import type { ProviderRegistry } from '../../providers/registry.js';
import { buildLanguageParams, extractReasoningDetails } from './handler.js';
import type { ChatCompletionRequest } from './schema.js';

function baseRequest(overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest {
  return {
    model: 'openai/gpt-4o-mini',
    messages: [],
    ...overrides,
  } as ChatCompletionRequest;
}

describe('chatCompletionsRoute', () => {
  it.each(['google', 'vertex'])('routes cached_content to the %s provider namespace', async (providerName) => {
    const doGenerate = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'hello' }],
      finishReason: 'stop' as const,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    }));
    const app = createApp({
      registry: {
        [providerName]: new MockProviderV4({
          languageModels: { gemini: new MockLanguageModelV4({ doGenerate }) },
        }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: `${providerName}/gemini`,
        cached_content: 'cachedContents/abc123',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(res.status).toBe(200);
    expect(doGenerate.mock.calls[0][0].providerOptions?.[providerName]?.cachedContent).toBe('cachedContents/abc123');
  });

  it('maps prompt_cache_key to Google cachedContent', async () => {
    const doGenerate = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'hello' }],
      finishReason: 'stop' as const,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    }));
    const app = createApp({
      registry: {
        google: new MockProviderV4({ languageModels: { gemini: new MockLanguageModelV4({ doGenerate }) } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini',
        prompt_cache_key: 'cachedContents/from-key',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(res.status).toBe(200);
    expect(doGenerate.mock.calls[0][0].providerOptions?.google).toMatchObject({
      cachedContent: 'cachedContents/from-key',
      promptCacheKey: 'cachedContents/from-key',
    });
  });

  it('does not map prompt_cache_key to cachedContent for other providers', async () => {
    const doGenerate = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'hello' }],
      finishReason: 'stop' as const,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    }));
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ languageModels: { model: new MockLanguageModelV4({ doGenerate }) } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/model',
        prompt_cache_key: 'cache-key',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(res.status).toBe(200);
    expect(doGenerate.mock.calls[0][0].providerOptions?.openai?.cachedContent).toBeUndefined();
  });

  it('preserves unrelated passthrough fields', async () => {
    const doGenerate = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'hello' }],
      finishReason: 'stop' as const,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    }));
    const app = createApp({
      registry: {
        google: new MockProviderV4({ languageModels: { gemini: new MockLanguageModelV4({ doGenerate }) } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini',
        some_other_field: 'preserved',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(res.status).toBe(200);
    expect(doGenerate.mock.calls[0][0].providerOptions?.google?.someOtherField).toBe('preserved');
  });

  it('forwards anthropic-aws cache markers through the Anthropic SDK namespace', async () => {
    const doGenerate = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'hello' }],
      finishReason: 'stop' as const,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    }));
    const app = createApp({
      registry: {
        'anthropic-aws': new MockProviderV4({
          languageModels: { claude: new MockLanguageModelV4({ doGenerate }) },
        }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic-aws/claude',
        cache_control: { type: 'ephemeral' },
        messages: [
          { role: 'system', content: 'system', cache_control: { type: 'ephemeral' } },
          { role: 'user', content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }] },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const call = doGenerate.mock.calls[0][0] as Record<string, any>;
    expect(call.providerOptions?.anthropic?.cacheControl).toEqual({ type: 'ephemeral' });
    expect(call.prompt[0].providerOptions?.anthropic?.cacheControl).toEqual({ type: 'ephemeral' });
    expect(call.prompt[1].content[0].providerOptions?.anthropic?.cacheControl).toEqual({ type: 'ephemeral' });
  });
});

describe('buildLanguageParams', () => {
  it('maps OpenAI wire fields to cross-provider language params', () => {
    const params = buildLanguageParams(baseRequest({
      temperature: 0.5,
      top_p: 0.9,
      top_k: 40,
      max_tokens: 256,
      presence_penalty: 0.1,
      frequency_penalty: 0.2,
      seed: 42,
    }));

    expect(params).toEqual({
      temperature: 0.5,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 256,
      stopSequences: undefined,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      seed: 42,
    });
  });

  it('falls back to max_completion_tokens when max_tokens is absent', () => {
    const params = buildLanguageParams(baseRequest({ max_completion_tokens: 512 }));
    expect(params.maxOutputTokens).toBe(512);
  });

  it('prefers max_completion_tokens over deprecated max_tokens when both are present', () => {
    const params = buildLanguageParams(baseRequest({ max_tokens: 100, max_completion_tokens: 512 }));
    expect(params.maxOutputTokens).toBe(512);
  });

  it('normalizes a single stop string into an array', () => {
    const params = buildLanguageParams(baseRequest({ stop: 'STOP' }));
    expect(params.stopSequences).toEqual(['STOP']);
  });

  it('passes through a stop array unchanged', () => {
    const params = buildLanguageParams(baseRequest({ stop: ['STOP', 'END'] }));
    expect(params.stopSequences).toEqual(['STOP', 'END']);
  });

  it('leaves every field undefined when the request has no params', () => {
    const params = buildLanguageParams(baseRequest());
    expect(params).toEqual({
      temperature: undefined,
      topP: undefined,
      topK: undefined,
      maxOutputTokens: undefined,
      stopSequences: undefined,
      presencePenalty: undefined,
      frequencyPenalty: undefined,
      seed: undefined,
    });
  });
});

describe('extractReasoningDetails', () => {
  it('returns an empty array when reasoning is undefined', () => {
    expect(extractReasoningDetails(undefined)).toEqual([]);
  });

  it('returns an empty array when reasoning is empty', () => {
    expect(extractReasoningDetails([])).toEqual([]);
  });

  it('converts reasoning parts into indexed reasoning.text details', () => {
    const details = extractReasoningDetails([
      { type: 'reasoning', text: 'first thought' },
      { type: 'reasoning', text: 'second thought' },
    ]);

    expect(details).toHaveLength(2);
    expect(details[0]).toMatchObject({ type: 'reasoning.text', text: 'first thought', index: 0 });
    expect(details[1]).toMatchObject({ type: 'reasoning.text', text: 'second thought', index: 1 });
    expect(details[0]?.id).toMatch(/^reasoning-/);
  });

  it('produces a reasoning.encrypted detail when redactedData is present in provider metadata', () => {
    const details = extractReasoningDetails([
      {
        type: 'reasoning',
        text: '',
        providerMetadata: { anthropic: { redactedData: 'encrypted_blob' } },
      } as never,
    ]);

    expect(details).toEqual([
      { type: 'reasoning.encrypted', id: expect.stringMatching(/^reasoning-/), index: 0, data: 'encrypted_blob', format: 'unknown' },
    ]);
  });

  it('skips parts that are not type "reasoning"', () => {
    const details = extractReasoningDetails([
      { type: 'text', text: 'not reasoning' },
      { type: 'reasoning', text: 'kept' },
    ] as never);

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ text: 'kept' });
  });

  it('skips reasoning parts with a non-string text', () => {
    const details = extractReasoningDetails([
      { type: 'reasoning', text: undefined },
      { type: 'reasoning', text: 'kept' },
    ] as never);

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ text: 'kept' });
  });

  it('assigns sequential index values based on kept details, not input position', () => {
    const details = extractReasoningDetails([
      { type: 'text', text: 'skip me' },
      { type: 'reasoning', text: 'a' },
      { type: 'reasoning', text: 'b' },
    ] as never);

    expect(details.map((d) => d.index)).toEqual([0, 1]);
  });
});
