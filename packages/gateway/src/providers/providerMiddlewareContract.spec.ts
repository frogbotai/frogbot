// G39 / PR4 — provider middleware emits providerOptions keys the SHIPPED
// AI SDK does not read, so the values are stripped before reaching upstream.
//
// This is a CONTRACT test: it imports the real provider-options TYPES from the
// installed @ai-sdk/* packages (node_modules — the shipped truth) and drives
// the actual middleware from providers/*/middleware.ts, then checks whether the
// key each middleware writes matches the key the SDK type declares. No network:
// key drift is caught purely against the SDK's own type + runtime key names.
//
// Confirmed SDK-read keys (node_modules, @ai-sdk/*@4.0.4):
//   - anthropic: providerOptions.anthropic.thinking.budgetTokens   (camelCase)
//   - openai:    providerOptions.openai.reasoningEffort ∈
//                {none,minimal,low,medium,high,xhigh}               (camelCase, NO 'max')
//   - bedrock:   providerOptions.bedrock.cachePoint                 (namespace 'bedrock')
//   - google:    providerOptions.google.thinkingConfig.thinkingBudget (CORRECT — matches middleware)

import { describe, expect, it } from 'vitest';
import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import type { OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';

import type { BeforeUpstreamHook } from '../hooks.js';
import { claudeThinkingEffort } from './anthropic/middleware.js';
import { openaiReasoningEffort } from './openai/middleware.js';
import { bedrockCachePoint } from './bedrock/middleware.js';
import { vertexThinkingBudget } from './vertex/middleware.js';
import { effortFromBudget } from '../utils/params.js';

/** Minimal beforeUpstream args factory for driving a middleware in isolation. */
function makeArgs(overrides: {
  model: string;
  providerOptions: Record<string, Record<string, unknown>>;
  maxOutputTokens?: number;
}): Parameters<BeforeUpstreamHook>[0] {
  return {
    operation: 'chatCompletions',
    model: overrides.model,
    providerOptions: overrides.providerOptions,
    params: { maxOutputTokens: overrides.maxOutputTokens ?? 4096 },
  } as unknown as Parameters<BeforeUpstreamHook>[0];
}

describe('provider middleware providerOptions key contract — G39/PR4', () => {
  // Anthropic middleware writes `thinking.budget_tokens`, but the shipped
  // AnthropicProviderOptions type only carries `thinking.budgetTokens`. The
  // budget the operator asked for is dropped by the SDK → thinking silent no-op.
  it('claudeThinkingEffort emits the SDK-read anthropic.thinking.budgetTokens key', () => {
    const providerOptions: Record<string, Record<string, unknown>> = {
      openai: { reasoning_effort: 'high' },
    };
    void claudeThinkingEffort(makeArgs({ model: 'anthropic/claude-sonnet-4', providerOptions }));

    const thinking = providerOptions['anthropic']?.['thinking'] as Record<string, unknown>;
    expect(thinking).toBeDefined();
    // The camelCase key is what the shipped SDK type declares and reads.
    const roundTripped = { thinking: { type: 'enabled' as const, budgetTokens: thinking['budgetTokens'] } } satisfies AnthropicProviderOptions;
    expect(roundTripped.thinking.budgetTokens).toBeTypeOf('number');
    expect(thinking['budgetTokens']).toBeTypeOf('number');
  });

  // OpenAI middleware writes `reasoning_effort`, but the shipped
  // OpenAIChatLanguageModelOptions type reads `reasoningEffort`. The value is
  // stripped → o-series reasoning level never applied.
  it('openaiReasoningEffort emits the SDK-read openai.reasoningEffort key', () => {
    const providerOptions: Record<string, Record<string, unknown>> = {
      anthropic: { thinking: { budget_tokens: 3600 } },
    };
    void openaiReasoningEffort(makeArgs({ model: 'openai/o3', providerOptions, maxOutputTokens: 4096 }));

    const openai = providerOptions['openai'] ?? {};
    const roundTripped = { reasoningEffort: openai['reasoningEffort'] as OpenAIChatLanguageModelOptions['reasoningEffort'] } satisfies OpenAIChatLanguageModelOptions;
    expect(roundTripped.reasoningEffort).toBeDefined();
    expect(openai['reasoningEffort']).toBeDefined();
  });

  // Bedrock middleware writes to the `amazon-bedrock` namespace, but the shipped
  // SDK reads cachePoint from the `bedrock` namespace (index.js:407). The
  // cachePoint marker never reaches the wire → no prompt caching on Bedrock.
  it('bedrockCachePoint emits cachePoint under the SDK-read `bedrock` namespace', () => {
    const providerOptions: Record<string, Record<string, unknown>> = {
      unknown: { cache_control: { type: 'ephemeral' } },
    };
    void bedrockCachePoint(makeArgs({ model: 'amazon-bedrock/anthropic.claude-sonnet-4', providerOptions }));

    expect(providerOptions['bedrock']?.['cachePoint']).toEqual({ type: 'default' });
  });

  // effortFromBudget can return 'max', which is NOT in the shipped OpenAI
  // reasoningEffort enum {none,minimal,low,medium,high,xhigh}. A near-full
  // budget yields an effort string the SDK rejects/ignores.
  it('effortFromBudget never emits a value outside the SDK reasoningEffort enum', () => {
    const validEfforts: ReadonlyArray<NonNullable<OpenAIChatLanguageModelOptions['reasoningEffort']>> = [
      'none', 'minimal', 'low', 'medium', 'high', 'xhigh',
    ];
    // maxOutputTokens tiny vs budget → fraction >= 0.95 → 'max'.
    const effort = effortFromBudget(10000, 10000);
    expect(effort).toBeDefined();
    expect(validEfforts).toContain(effort as (typeof validEfforts)[number]);
  });

  // Control: the Vertex middleware IS correct — it writes
  // google.thinkingConfig.thinkingBudget, exactly the SDK-read key. This
  // passes as a plain it() to document that not every middleware drifts.
  it('vertexThinkingBudget emits the SDK-read google.thinkingConfig.thinkingBudget key', () => {
    const providerOptions: Record<string, Record<string, unknown>> = {
      openai: { reasoning_effort: 'high' },
    };
    void vertexThinkingBudget(makeArgs({ model: 'vertex/gemini-2.5-pro', providerOptions, maxOutputTokens: 4096 }));

    const google = providerOptions['google'] as GoogleGenerativeAIProviderOptions;
    expect(google.thinkingConfig?.thinkingBudget).toBeTypeOf('number');
  });
});
