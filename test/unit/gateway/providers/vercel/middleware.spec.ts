import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import type { OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import { describe, expect, it } from 'vitest';

import type { BeforeUpstreamHookArgs } from '../../../../../packages/gateway/src/hooks.js';
import { getProviderHooks } from '../../../../../packages/gateway/src/providers/middleware.js';
import { vercelBeforeUpstream } from '../../../../../packages/gateway/src/providers/vercel/middleware.js';

function makeArgs(
  model: string,
  overrides: Partial<BeforeUpstreamHookArgs> = {},
): BeforeUpstreamHookArgs {
  return {
    phase: 'beforeUpstream',
    operation: 'chat.completions',
    requestId: 'test-req',
    startedAt: Date.now(),
    context: {},
    otel: {},
    model,
    provider: 'vercel',
    messages: [],
    params: { maxOutputTokens: 10_000 },
    headers: new Headers(),
    providerOptions: {},
    ...overrides,
  };
}

async function run(args: BeforeUpstreamHookArgs) {
  for (const hook of vercelBeforeUpstream) {
    await hook(args);
  }

  return args;
}

describe('vercelBeforeUpstream', () => {
  it('is registered for the vercel provider', () => {
    expect(getProviderHooks('vercel').beforeUpstream).toBe(vercelBeforeUpstream);
  });

  it('maps reasoning effort and cache control to Anthropic options for Claude', async () => {
    const message = {
      role: 'user',
      content: 'hi',
      providerOptions: { unknown: { cache_control: { type: 'ephemeral' } } },
    };

    const { providerOptions } = await run(
      makeArgs('vercel/anthropic/claude-sonnet-4.6', {
        messages: [message],
        providerOptions: {
          unknown: { reasoning_effort: 'high', cache_control: { type: 'ephemeral' } },
        },
      }),
    );

    const anthropic = providerOptions.anthropic as AnthropicProviderOptions;

    expect(anthropic.thinking).toEqual({ type: 'enabled', budgetTokens: 8000 });
    expect(anthropic.cacheControl).toEqual({ type: 'ephemeral' });
    expect(message.providerOptions).toEqual({ anthropic: { cacheControl: { type: 'ephemeral' } } });
    expect(providerOptions).not.toHaveProperty('unknown');
    expect(providerOptions).not.toHaveProperty('vercel');
  });

  it('keeps explicit Anthropic thinking over reasoning effort', async () => {
    const thinking = { type: 'enabled', budgetTokens: 2048 };

    const { providerOptions } = await run(
      makeArgs('vercel/anthropic/claude-sonnet-4.6', {
        providerOptions: { anthropic: { thinking }, unknown: { reasoning_effort: 'high' } },
      }),
    );

    expect(providerOptions.anthropic?.thinking).toEqual(thinking);
  });

  it('maps reasoning effort to OpenAI reasoningEffort', async () => {
    const { providerOptions } = await run(
      makeArgs('vercel/openai/gpt-5.4-mini', {
        providerOptions: { unknown: { reasoning_effort: 'low' } },
      }),
    );

    const openai = providerOptions.openai as OpenAIChatLanguageModelOptions;

    expect(openai.reasoningEffort).toBe('low');
  });

  it('maps reasoning effort to a Gemini thinking budget', async () => {
    const { providerOptions } = await run(
      makeArgs('vercel/google/gemini-2.5-pro', {
        providerOptions: { unknown: { reasoning_effort: 'high' } },
      }),
    );

    const google = providerOptions.google as GoogleGenerativeAIProviderOptions;

    expect(google.thinkingConfig?.thinkingBudget).toBe(8000);
  });

  it('passes routing options through under providerOptions.gateway', async () => {
    const routing = { order: ['bedrock', 'anthropic'], only: ['bedrock', 'anthropic'] };

    const { providerOptions } = await run(
      makeArgs('vercel/anthropic/claude-sonnet-4.6', {
        providerOptions: { unknown: { gateway: routing } },
      }),
    );

    expect(providerOptions.gateway).toEqual(routing);
    expect(providerOptions.anthropic).not.toHaveProperty('gateway');
  });

  it('keeps explicit gateway options over passthrough ones', async () => {
    const { providerOptions } = await run(
      makeArgs('vercel/anthropic/claude-sonnet-4.6', {
        providerOptions: {
          gateway: { order: ['anthropic'] },
          unknown: { gateway: { order: ['bedrock'], caching: 'auto' } },
        },
      }),
    );

    expect(providerOptions.gateway).toEqual({ order: ['anthropic'], caching: 'auto' });
  });

  it('leaves options for other creators untouched', async () => {
    const { providerOptions } = await run(
      makeArgs('vercel/xai/grok-4', { providerOptions: { unknown: { reasoning_effort: 'high' } } }),
    );

    expect(providerOptions).toEqual({ unknown: { reasoning_effort: 'high' } });
  });
});
