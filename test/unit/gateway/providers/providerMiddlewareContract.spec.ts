import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import type { OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import type { OpenRouterProviderOptions } from '@openrouter/ai-sdk-provider';
import { assert, describe, expect, it } from 'vitest';

import type { BeforeUpstreamHook } from '../../../../packages/gateway/src/hooks.js';
import { claudeThinkingEffort } from '../../../../packages/gateway/src/providers/anthropic/middleware.js';
import { bedrockCachePoint } from '../../../../packages/gateway/src/providers/bedrock/middleware.js';
import { openaiReasoningEffort } from '../../../../packages/gateway/src/providers/openai/middleware.js';
import { openrouterReasoning } from '../../../../packages/gateway/src/providers/openrouter/middleware.js';
import { vercelBeforeUpstream } from '../../../../packages/gateway/src/providers/vercel/middleware.js';
import { vertexThinkingBudget } from '../../../../packages/gateway/src/providers/vertex/middleware.js';
import { effortFromBudget } from '../../../../packages/gateway/src/utils/params.js';

function makeArgs(overrides: {
  model: string;
  providerOptions: Record<string, Record<string, unknown>>;
  messages?: unknown[];
  maxOutputTokens?: number;
}): Parameters<BeforeUpstreamHook>[0] {
  return {
    operation: 'chatCompletions',
    model: overrides.model,
    providerOptions: overrides.providerOptions,
    messages: overrides.messages,
    params: { maxOutputTokens: overrides.maxOutputTokens ?? 4096 },
  } as unknown as Parameters<BeforeUpstreamHook>[0];
}

describe('provider middleware providerOptions key contract — G39/PR4', () => {
  it('claudeThinkingEffort emits the SDK-read anthropic.thinking.budgetTokens key', () => {
    const providerOptions: Record<string, Record<string, unknown>> = {
      unknown: { reasoning_effort: 'high' },
    };

    void claudeThinkingEffort(makeArgs({ model: 'anthropic/claude-sonnet-4', providerOptions }));

    const thinking = providerOptions['anthropic']?.['thinking'] as Record<string, unknown>;

    expect(thinking).toBeDefined();

    const budgetTokens = thinking['budgetTokens'];
    assert(typeof budgetTokens === 'number', 'thinking.budgetTokens is a number');
    const roundTripped = {
      thinking: { type: 'enabled' as const, budgetTokens },
    } satisfies AnthropicProviderOptions;

    expect(roundTripped.thinking.budgetTokens).toBeTypeOf('number');
    expect(thinking['budgetTokens']).toBeTypeOf('number');
  });

  it('openaiReasoningEffort emits the SDK-read openai.reasoningEffort key', () => {
    const providerOptions: Record<string, Record<string, unknown>> = {
      anthropic: { thinking: { budget_tokens: 3600 } },
    };

    void openaiReasoningEffort(
      makeArgs({ model: 'openai/o3', providerOptions, maxOutputTokens: 4096 }),
    );

    const openai = providerOptions['openai'] ?? {};
    const roundTripped = {
      reasoningEffort: openai[
        'reasoningEffort'
      ] as OpenAIChatLanguageModelOptions['reasoningEffort'],
    } satisfies OpenAIChatLanguageModelOptions;

    expect(roundTripped.reasoningEffort).toBeDefined();
    expect(openai['reasoningEffort']).toBeDefined();
  });

  it('bedrockCachePoint emits cachePoint under the SDK-read `bedrock` namespace', () => {
    const providerOptions: Record<string, Record<string, unknown>> = {};
    const message = {
      role: 'user',
      content: 'Hello',
      providerOptions: {
        unknown: { cache_control: { type: 'ephemeral' } },
      } as Record<string, Record<string, unknown>>,
    };

    void bedrockCachePoint(
      makeArgs({
        model: 'bedrock/anthropic.claude-sonnet-4',
        providerOptions,
        messages: [message],
      }),
    );

    expect(message.providerOptions['bedrock']?.['cachePoint']).toEqual({ type: 'default' });
    expect(providerOptions['bedrock']).toBeUndefined();
  });

  it('effortFromBudget never emits a value outside the SDK reasoningEffort enum', () => {
    const validEfforts: ReadonlyArray<
      NonNullable<OpenAIChatLanguageModelOptions['reasoningEffort']>
    > = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

    const effort = effortFromBudget(10000, 10000);

    expect(effort).toBeDefined();
    expect(validEfforts).toContain(effort as (typeof validEfforts)[number]);
  });

  it('vertexThinkingBudget emits the SDK-read google.thinkingConfig.thinkingBudget key', () => {
    const providerOptions: Record<string, Record<string, unknown>> = {
      unknown: { reasoning_effort: 'high' },
    };

    void vertexThinkingBudget(
      makeArgs({ model: 'vertex/gemini-2.5-pro', providerOptions, maxOutputTokens: 4096 }),
    );

    const google = providerOptions['google'] as GoogleGenerativeAIProviderOptions;

    expect(google.thinkingConfig?.thinkingBudget).toBeTypeOf('number');
  });

  it('vercelBeforeUpstream emits SDK-read Anthropic and OpenAI option keys', async () => {
    const claude: Record<string, Record<string, unknown>> = {
      unknown: { reasoning_effort: 'high', cache_control: { type: 'ephemeral' } },
    };

    const gpt: Record<string, Record<string, unknown>> = {
      unknown: { reasoning_effort: 'low' },
    };

    for (const hook of vercelBeforeUpstream) {
      await hook(
        makeArgs({ model: 'vercel/anthropic/claude-sonnet-4.6', providerOptions: claude }),
      );

      await hook(makeArgs({ model: 'vercel/openai/gpt-5.4-mini', providerOptions: gpt }));
    }

    const anthropic = claude['anthropic'] ?? {};
    const thinking = anthropic['thinking'] as { budgetTokens: number };

    const anthropicOptions = {
      thinking: { type: 'enabled' as const, budgetTokens: thinking.budgetTokens },
      cacheControl: anthropic['cacheControl'] as AnthropicProviderOptions['cacheControl'],
    } satisfies AnthropicProviderOptions;

    const openaiOptions = {
      reasoningEffort: gpt['openai']?.[
        'reasoningEffort'
      ] as OpenAIChatLanguageModelOptions['reasoningEffort'],
    } satisfies OpenAIChatLanguageModelOptions;

    expect(anthropicOptions.thinking.budgetTokens).toBeTypeOf('number');
    expect(anthropicOptions.cacheControl).toEqual({ type: 'ephemeral' });
    expect(openaiOptions.reasoningEffort).toBe('low');
  });

  it('openrouterReasoning emits the adapter-read openrouter.reasoning shape', () => {
    const fromEffort: Record<string, Record<string, unknown>> = {
      unknown: { reasoning_effort: 'high' },
    };

    const fromThinking: Record<string, Record<string, unknown>> = {
      anthropic: { thinking: { type: 'enabled', budgetTokens: 2048 } },
    };

    void openrouterReasoning(
      makeArgs({ model: 'openrouter/anthropic/claude-sonnet-4.6', providerOptions: fromEffort }),
    );

    void openrouterReasoning(
      makeArgs({ model: 'openrouter/anthropic/claude-sonnet-4.6', providerOptions: fromThinking }),
    );

    const effort = fromEffort['openrouter'] as OpenRouterProviderOptions;
    const budget = fromThinking['openrouter'] as OpenRouterProviderOptions;

    expect(effort.reasoning).toEqual({
      effort: 'high',
    } satisfies OpenRouterProviderOptions['reasoning']);
    expect(budget.reasoning).toEqual({
      max_tokens: 2048,
    } satisfies OpenRouterProviderOptions['reasoning']);
  });
});
