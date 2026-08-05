import { MockLanguageModelV4, MockProviderV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import type { ProviderRegistry } from '../../providers/registry.js';

describe('messagesRoute', () => {
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

    const res = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic-aws/claude',
        max_tokens: 128,
        cache_control: { type: 'ephemeral' },
        system: [{ type: 'text', text: 'system', cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }],
        }],
        tools: [{
          name: 'lookup',
          description: 'Lookup a value',
          input_schema: { type: 'object', properties: {} },
          cache_control: { type: 'ephemeral' },
        }],
      }),
    });

    expect(res.status).toBe(200);
    const call = doGenerate.mock.calls[0][0] as Record<string, any>;
    expect(call.providerOptions?.anthropic?.cacheControl).toEqual({ type: 'ephemeral' });
    expect(call.prompt[0].providerOptions?.anthropic?.cacheControl).toEqual({ type: 'ephemeral' });
    expect(call.prompt[1].content[0].providerOptions?.anthropic?.cacheControl).toEqual({ type: 'ephemeral' });
    expect(call.tools[0].providerOptions?.anthropic?.cacheControl).toEqual({ type: 'ephemeral' });
  });
});
