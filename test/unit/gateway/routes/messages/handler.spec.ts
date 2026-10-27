import { MockLanguageModelV4, MockProviderV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../../../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../../../../packages/gateway/src/providers/registry.js';
import { firstCallOptions, generateResult, mockDoGenerate } from '../mockModels.js';

describe('messagesRoute', () => {
  it('forwards anthropic-aws cache markers through the Anthropic SDK namespace', async () => {
    const doGenerate = mockDoGenerate(
      generateResult({ content: [{ type: 'text', text: 'hello' }] }),
    );

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
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }],
          },
        ],
        tools: [
          {
            name: 'lookup',
            description: 'Lookup a value',
            input_schema: { type: 'object', properties: {} },
            cache_control: { type: 'ephemeral' },
          },
        ],
      }),
    });

    expect(res.status).toBe(200);

    const call = firstCallOptions(doGenerate) as Record<string, any>;

    expect(call.providerOptions?.anthropic?.cacheControl).toEqual({ type: 'ephemeral' });
    expect(call.prompt[0].providerOptions?.anthropic?.cacheControl).toEqual({ type: 'ephemeral' });
    expect(call.prompt[1].content[0].providerOptions?.anthropic?.cacheControl).toEqual({
      type: 'ephemeral',
    });
    expect(call.tools[0].providerOptions?.anthropic?.cacheControl).toEqual({ type: 'ephemeral' });
  });

  async function callMessages(model: string, modelName: string, body: Record<string, unknown>) {
    const doGenerate = mockDoGenerate(
      generateResult({ content: [{ type: 'text', text: 'hello' }] }),
    );

    const app = createApp({
      registry: {
        [model.split('/')[0]]: new MockProviderV4({
          languageModels: { [modelName]: new MockLanguageModelV4({ doGenerate }) },
        }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 128,
        messages: [{ role: 'user', content: 'hello' }],
        ...body,
      }),
    });

    expect(res.status).toBe(200);

    return firstCallOptions(doGenerate).providerOptions;
  }

  it('moves a top-level gateway field to providerOptions.gateway on Vercel', async () => {
    const providerOptions = await callMessages('vercel/acme/model', 'acme/model', {
      gateway: { order: ['bedrock', 'anthropic'] },
    });

    expect(providerOptions?.gateway).toEqual({ order: ['bedrock', 'anthropic'] });
  });

  it("maps Vercel's providerOptions.gateway body field", async () => {
    const providerOptions = await callMessages('vercel/acme/model', 'acme/model', {
      providerOptions: { gateway: { only: ['bedrock'] } },
    });

    expect(providerOptions?.gateway).toEqual({ only: ['bedrock'] });
  });

  it('forwards OpenRouter provider, models and plugins', async () => {
    const providerOptions = await callMessages('openrouter/acme/model', 'acme/model', {
      provider: { order: ['anthropic'], allow_fallbacks: false },
      models: ['acme/model', 'acme/backup'],
      plugins: [{ id: 'web' }],
    });

    expect(providerOptions?.openrouter).toEqual({
      provider: { order: ['anthropic'], allow_fallbacks: false },
      models: ['acme/model', 'acme/backup'],
      plugins: [{ id: 'web' }],
    });
  });

  it('does not forward handled fields as passthrough', async () => {
    const providerOptions = await callMessages('openrouter/acme/model', 'acme/model', {
      stop_sequences: ['END'],
      temperature: 0.5,
    });

    expect(providerOptions?.openrouter).toBeUndefined();
  });
});
