import { describe, expect, it } from 'vitest';

import {
  canonicalizeModelId,
  DEFAULT_MODEL_CATALOG,
} from '../../../../packages/gateway/src/index.js';
import type { ModelReasoningOption } from '../../../../packages/gateway/src/providers/catalog.js';
import {
  resolveReasoningVariants,
  type ResolveReasoningVariantsArgs,
} from '../../../../packages/gateway/src/providers/reasoning.js';

const effort = (...values: string[]): ModelReasoningOption => ({ type: 'effort', values });
const toggle: ModelReasoningOption = { type: 'toggle' };
const budget = (min?: number, max?: number): ModelReasoningOption => ({
  type: 'budget_tokens',
  ...(min !== undefined && { min }),
  ...(max !== undefined && { max }),
});

const keys = (args: ResolveReasoningVariantsArgs) =>
  resolveReasoningVariants(args).map((variant) => variant.key);

const variant = (args: ResolveReasoningVariantsArgs, key: string) =>
  resolveReasoningVariants(args).find((item) => item.key === key);

const adaptive = { type: 'adaptive', display: 'summarized' };

describe('resolveReasoningVariants — OpenAI', () => {
  it('offers the catalog efforts with human labels', () => {
    const variants = resolveReasoningVariants({
      modelId: 'openai/gpt-5.6',
      options: [effort('none', 'low', 'medium', 'high', 'xhigh', 'max')],
    });

    expect(variants.map(({ key, label }) => [key, label])).toEqual([
      ['none', 'Off'],
      ['low', 'Low'],
      ['medium', 'Medium'],
      ['high', 'High'],
      ['xhigh', 'Extra High'],
      ['max', 'Max'],
    ]);
  });

  it('sends Responses reasoning settings in the openai namespace', () => {
    const high = variant({ modelId: 'openai/gpt-5.6', options: [effort('high')] }, 'high');

    expect(high?.providerOptions).toEqual({
      openai: {
        reasoningEffort: 'high',
        reasoningSummary: 'auto',
        include: ['reasoning.encrypted_content'],
        forceReasoning: true,
      },
    });
  });

  it('limits o3-mini to its three levels without Off', () => {
    expect(keys({ modelId: 'openai/o3-mini', options: [effort('low', 'medium', 'high')] })).toEqual(
      ['low', 'medium', 'high'],
    );
  });

  it('offers a Pro model its single level', () => {
    expect(keys({ modelId: 'openai/gpt-5-pro', options: [effort('high')] })).toEqual(['high']);
  });

  it('uses the Responses default efforts when values are missing', () => {
    expect(keys({ modelId: 'openai/gpt-5.6', options: [{ type: 'effort' }] })).toEqual([
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });

  it('ignores toggle and budget claims', () => {
    expect(keys({ modelId: 'openai/gpt-5.6', options: [toggle, budget(1024)] })).toEqual([]);
  });
});

describe('resolveReasoningVariants — Anthropic', () => {
  it('offers Sonnet 4.6 adaptive efforts up to max without xhigh', () => {
    const args = {
      modelId: 'anthropic/claude-sonnet-4-6',
      options: [effort('low', 'medium', 'high', 'max'), budget(1024)],
      outputLimit: 128_000,
    };

    expect(keys(args)).toEqual(['low', 'medium', 'high', 'max']);
    expect(variant(args, 'max')?.providerOptions).toEqual({
      anthropic: { thinking: adaptive, effort: 'max' },
    });
  });

  it('offers Opus 4.7 xhigh and max as adaptive efforts', () => {
    const args = {
      modelId: 'anthropic/claude-opus-4-7',
      options: [effort('low', 'medium', 'high', 'xhigh', 'max')],
      outputLimit: 128_000,
    };

    expect(keys(args)).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(variant(args, 'xhigh')?.providerOptions).toEqual({
      anthropic: { thinking: adaptive, effort: 'xhigh' },
    });
  });

  it('uses per-version default efforts when values are missing', () => {
    expect(keys({ modelId: 'anthropic/claude-sonnet-4-6', options: [{ type: 'effort' }] })).toEqual(
      ['low', 'medium', 'high', 'max'],
    );
    expect(keys({ modelId: 'anthropic/claude-opus-4-7', options: [{ type: 'effort' }] })).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
  });

  it('labels budget presets with their token counts', () => {
    const variants = resolveReasoningVariants({
      modelId: 'anthropic/claude-sonnet-4-5',
      options: [budget(1024)],
      outputLimit: 64_000,
    });

    expect(variants).toEqual([
      {
        key: 'high',
        label: 'High · 16k',
        providerOptions: {
          anthropic: { thinking: { type: 'enabled', budgetTokens: 16_000 } },
        },
      },
      {
        key: 'max',
        label: 'Max · 32k',
        providerOptions: {
          anthropic: { thinking: { type: 'enabled', budgetTokens: 32_000 } },
        },
      },
    ]);
  });

  it('turns effort claims on manual-thinking models into budget presets', () => {
    expect(
      keys({
        modelId: 'anthropic/claude-sonnet-4-5',
        options: [effort('low', 'high')],
        outputLimit: 64_000,
      }),
    ).toEqual(['high', 'max']);
  });

  it('pairs Opus 4.5 efforts with a manual thinking budget', () => {
    const low = variant(
      {
        modelId: 'anthropic/claude-opus-4-5',
        options: [effort('low', 'medium', 'high'), budget(1024)],
        outputLimit: 64_000,
      },
      'low',
    );

    expect(low?.providerOptions).toEqual({
      anthropic: { thinking: { type: 'enabled', budgetTokens: 16_000 }, effort: 'low' },
    });
  });

  it('prepends Off when the model can disable thinking', () => {
    const args = {
      modelId: 'anthropic/claude-sonnet-5',
      options: [toggle, effort('low', 'high')],
      outputLimit: 128_000,
    };

    expect(keys(args)).toEqual(['none', 'low', 'high']);
    expect(variant(args, 'none')?.providerOptions).toEqual({
      anthropic: { thinking: { type: 'disabled' } },
    });
  });

  it('never offers Off for always-thinking models', () => {
    expect(
      keys({ modelId: 'anthropic/claude-fable-5', options: [toggle, effort('low', 'high')] }),
    ).toEqual(['low', 'high']);
  });

  it('offers no budget presets without an output limit or maximum', () => {
    expect(keys({ modelId: 'anthropic/claude-sonnet-4-5', options: [budget(1024)] })).toEqual([]);
  });

  it('offers no budget presets when the output limit is below the minimum budget', () => {
    expect(
      keys({ modelId: 'anthropic/claude-sonnet-4-5', options: [budget(1024)], outputLimit: 1000 }),
    ).toEqual([]);
  });

  it('caps budget presets at half the output limit to leave room for the answer', () => {
    const variants = resolveReasoningVariants({
      modelId: 'anthropic/claude-sonnet-4-5',
      options: [budget(1024, 100_000)],
      outputLimit: 8192,
    });

    expect(variants.map(({ providerOptions }) => providerOptions.anthropic?.thinking)).toEqual([
      { type: 'enabled', budgetTokens: 2048 },
      { type: 'enabled', budgetTokens: 4096 },
    ]);
  });

  it('offers only High when the capped maximum equals the minimum budget', () => {
    const variants = resolveReasoningVariants({
      modelId: 'anthropic/claude-sonnet-4-5',
      options: [budget(1024)],
      outputLimit: 2048,
    });

    expect(variants.map(({ key, label }) => [key, label])).toEqual([['high', 'High · 1k']]);
  });

  it('offers no budget presets when half the output limit is below the minimum budget', () => {
    expect(
      keys({ modelId: 'anthropic/claude-sonnet-4-5', options: [budget(1024)], outputLimit: 2000 }),
    ).toEqual([]);
  });
});

describe('resolveReasoningVariants — Google', () => {
  it('offers Gemini 2.5 budget presets capped by the model maximum', () => {
    const variants = resolveReasoningVariants({
      modelId: 'google/gemini-2.5-pro',
      options: [budget(128, 32_768)],
      outputLimit: 65_536,
    });

    expect(variants.map(({ label }) => label)).toEqual(['High · 16k', 'Max · 33k']);
    expect(variants[0]?.providerOptions).toEqual({
      google: { thinkingConfig: { includeThoughts: true, thinkingBudget: 16_384 } },
    });
  });

  it('turns thinking off with a zero budget where Gemini can toggle', () => {
    const args = {
      modelId: 'google/gemini-2.5-flash',
      options: [toggle, budget(0, 24_576)],
      outputLimit: 65_536,
    };

    expect(keys(args)).toEqual(['none', 'high', 'max']);
    expect(variant(args, 'none')?.providerOptions).toEqual({
      google: { thinkingConfig: { includeThoughts: false, thinkingBudget: 0 } },
    });
  });

  it('offers Gemini 3 thinking levels including minimal where claimed', () => {
    const args = {
      modelId: 'google/gemini-3.6-flash',
      options: [effort('minimal', 'low', 'medium', 'high')],
    };

    expect(keys(args)).toEqual(['minimal', 'low', 'medium', 'high']);
    expect(variant(args, 'minimal')?.providerOptions).toEqual({
      google: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'minimal' } },
    });
  });

  it('omits minimal for Gemini 3 models that do not claim it', () => {
    expect(
      keys({
        modelId: 'google/gemini-3.1-pro-preview',
        options: [effort('low', 'medium', 'high')],
      }),
    ).toEqual(['low', 'medium', 'high']);
  });

  it('offers Off and On for toggle-only models', () => {
    const variants = resolveReasoningVariants({
      modelId: 'google/gemma-4-31b-it',
      options: [toggle],
    });

    expect(variants.map(({ key, label }) => [key, label])).toEqual([
      ['none', 'Off'],
      ['thinking', 'On'],
    ]);
    expect(variants[1]?.providerOptions).toEqual({
      google: { thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } },
    });
  });
});

describe('resolveReasoningVariants — Vertex', () => {
  const catalogArgs = (modelId: string) => {
    const entry = DEFAULT_MODEL_CATALOG.get(modelId);

    return {
      modelId,
      options: entry?.capabilities.reasoningOptions,
      outputLimit: entry?.context.output,
    };
  };

  it('offers Gemini presets under the vertex namespace', () => {
    const args = catalogArgs('vertex/gemini-3.5-flash');

    expect(keys(args)).toEqual(['minimal', 'low', 'medium', 'high']);
    expect(variant(args, 'high')?.providerOptions).toEqual({
      vertex: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' } },
    });
  });

  it('offers Claude the Anthropic presets under the anthropic namespace', () => {
    const vertex = resolveReasoningVariants(catalogArgs('vertex/claude-sonnet-4-6@default'));
    const anthropic = resolveReasoningVariants({
      ...catalogArgs('vertex/claude-sonnet-4-6@default'),
      modelId: 'anthropic/claude-sonnet-4-6',
    });

    expect(vertex.length).toBeGreaterThan(0);
    expect(vertex).toEqual(anthropic);
    expect(vertex.every((item) => Object.keys(item.providerOptions).join() === 'anthropic')).toBe(
      true,
    );
  });
});

describe('resolveReasoningVariants — Bedrock', () => {
  it('sends Claude efforts through reasoningConfig with adaptive thinking', () => {
    const args = {
      modelId: 'bedrock/us.anthropic.claude-opus-4-7',
      options: [toggle, effort('low', 'medium', 'high', 'xhigh', 'max')],
      outputLimit: 128_000,
    };

    expect(keys(args)).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect(variant(args, 'max')?.providerOptions).toEqual({
      bedrock: { reasoningConfig: { ...adaptive, maxReasoningEffort: 'max' } },
    });
    expect(variant(args, 'none')?.providerOptions).toEqual({
      bedrock: { additionalModelRequestFields: { thinking: { type: 'disabled' } } },
    });
  });

  it('sends manual-thinking Claude efforts without adaptive thinking', () => {
    const low = variant(
      {
        modelId: 'bedrock/anthropic.claude-opus-4-5-20251101-v1:0',
        options: [effort('low', 'medium', 'high')],
      },
      'low',
    );

    expect(low?.providerOptions).toEqual({
      bedrock: { reasoningConfig: { maxReasoningEffort: 'low' } },
    });
  });

  it('sends Claude budget presets as budgetTokens', () => {
    const high = variant(
      {
        modelId: 'bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        options: [toggle, budget(1024)],
        outputLimit: 64_000,
      },
      'high',
    );

    expect(high?.providerOptions).toEqual({
      bedrock: { reasoningConfig: { type: 'enabled', budgetTokens: 16_000 } },
    });
  });

  it('sends non-Claude efforts and toggles through reasoningConfig', () => {
    const args = {
      modelId: 'bedrock/us.amazon.nova-2-lite-v1:0',
      options: [toggle, effort('low', 'medium', 'high')],
    };

    expect(keys(args)).toEqual(['none', 'low', 'medium', 'high']);
    expect(variant(args, 'low')?.providerOptions).toEqual({
      bedrock: { reasoningConfig: { type: 'enabled', maxReasoningEffort: 'low' } },
    });
    expect(variant(args, 'none')?.providerOptions).toEqual({
      bedrock: { additionalModelRequestFields: { reasoningConfig: { type: 'disabled' } } },
    });
  });

  it('offers Converse GPT models Off through additionalModelRequestFields', () => {
    const args = {
      modelId: 'bedrock/us.openai.gpt-5.6-luna',
      options: [effort('none', 'low', 'max')],
    };

    expect(keys(args)).toEqual(['none', 'low', 'max']);
    expect(variant(args, 'none')?.providerOptions).toEqual({
      bedrock: { additionalModelRequestFields: { reasoning: { effort: 'none' } } },
    });
    expect(variant(args, 'max')?.providerOptions).toEqual({
      bedrock: { reasoningConfig: { type: 'enabled', maxReasoningEffort: 'max' } },
    });
  });

  it('drops efforts the Bedrock SDK cannot send', () => {
    expect(
      keys({ modelId: 'bedrock/us.amazon.nova-2-lite-v1:0', options: [effort('none', 'low')] }),
    ).toEqual(['low']);
  });

  it('routes Mantle models through the OpenAI Responses rules', () => {
    const high = variant(
      { modelId: 'bedrock/openai.gpt-5.6-luna', options: [effort('none', 'high')] },
      'high',
    );

    expect(DEFAULT_MODEL_CATALOG.get('bedrock/openai.gpt-5.6-luna')?.sdk?.npm).toBe(
      '@ai-sdk/amazon-bedrock/mantle',
    );
    expect(high?.providerOptions).toEqual({
      openai: {
        reasoningEffort: 'high',
        reasoningSummary: 'auto',
        include: ['reasoning.encrypted_content'],
        forceReasoning: true,
      },
    });
  });
});

describe('resolveReasoningVariants — OpenAI-compatible families', () => {
  it('offers DeepInfra Off and efforts through separate settings', () => {
    const args = {
      modelId: 'deepinfra/Qwen/Qwen3.8-27B',
      options: [toggle, effort('low', 'medium', 'xhigh')],
    };

    expect(keys(args)).toEqual(['none', 'low', 'medium', 'xhigh']);
    expect(variant(args, 'none')?.providerOptions).toEqual({
      deepinfra: { reasoning: { enabled: false } },
    });
    expect(variant(args, 'xhigh')?.providerOptions).toEqual({
      deepinfra: { reasoningEffort: 'xhigh' },
    });
  });

  it('offers DeepInfra toggle-only models Off and On', () => {
    const on = variant(
      { modelId: 'deepinfra/XiaomiMiMo/MiMo-V2.6-Pro', options: [toggle] },
      'thinking',
    );

    expect(on?.providerOptions).toEqual({ deepinfra: { reasoning: { enabled: true } } });
  });

  it('offers nothing for DeepInfra Kimi K2.7 Code', () => {
    expect(keys({ modelId: 'deepinfra/moonshotai/Kimi-K2.7-Code', options: [toggle] })).toEqual([]);
  });

  it('offers Together AI efforts only', () => {
    expect(
      keys({
        modelId: 'togetherai/deepseek-ai/DeepSeek-V4-Pro',
        options: [toggle, effort('high', 'max')],
      }),
    ).toEqual(['high', 'max']);
    expect(keys({ modelId: 'togetherai/moonshotai/Kimi-K2.6', options: [toggle] })).toEqual([]);
  });

  it('orders efforts from lowest to highest', () => {
    expect(
      keys({
        modelId: 'togetherai/thinkingmachines/Inkling',
        options: [effort('max', 'xhigh', 'high', 'medium', 'low', 'none')],
      }),
    ).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('offers Fireworks efforts only', () => {
    expect(
      keys({
        modelId: 'fireworks/accounts/fireworks/models/kimi-k3',
        options: [toggle, effort('low', 'max'), budget(1024)],
        outputLimit: 131_072,
      }),
    ).toEqual(['low', 'max']);
  });

  it('drops the efforts the Fireworks SDK rewrites to another level', () => {
    expect(
      keys({
        modelId: 'fireworks/accounts/fireworks/models/qwen3p8-2p4t-a95b',
        options: [effort('minimal', 'low', 'medium', 'xhigh')],
      }),
    ).toEqual(['low', 'medium']);
  });

  it('never offers Groq default as a variant', () => {
    expect(
      keys({ modelId: 'groq/qwen/qwen3.6-27b', options: [effort('none', 'default')] }),
    ).toEqual(['none']);
  });

  it('drops efforts the Mistral SDK cannot send', () => {
    expect(
      keys({ modelId: 'mistral/zai-glm-5-2', options: [effort('none', 'high', 'max')] }),
    ).toEqual(['none', 'high']);
  });

  it('offers nothing for Mistral GLM 5.3, whose effort the SDK never sends', () => {
    expect(
      keys({ modelId: 'mistral/zai-glm-5-3', options: [effort('low', 'high', 'max')] }),
    ).toEqual([]);
  });

  it('sends Perplexity efforts as snake_case reasoning_effort', () => {
    const low = variant(
      { modelId: 'perplexity/sonar-reasoning-pro', options: [effort('minimal', 'low')] },
      'low',
    );

    expect(low?.providerOptions).toEqual({ perplexity: { reasoning_effort: 'low' } });
  });

  it('sends xAI and Cerebras efforts in their own namespaces', () => {
    expect(
      variant({ modelId: 'xai/grok-4.7', options: [effort('xhigh')] }, 'xhigh')?.providerOptions,
    ).toEqual({ xai: { reasoningEffort: 'xhigh' } });
    expect(
      variant({ modelId: 'cerebras/gpt-oss-120b', options: [effort('low')] }, 'low')
        ?.providerOptions,
    ).toEqual({ cerebras: { reasoningEffort: 'low' } });
  });

  it('uses the custom provider options name', () => {
    const variants = resolveReasoningVariants({
      modelId: 'local/qwen',
      options: [effort('low', 'high')],
      providerOptionsName: 'local',
    });

    expect(variants.map(({ providerOptions }) => providerOptions)).toEqual([
      { local: { reasoningEffort: 'low' } },
      { local: { reasoningEffort: 'high' } },
    ]);
  });
});

describe('resolveReasoningVariants — Cohere', () => {
  it('offers nothing for effort claims', () => {
    expect(
      keys({ modelId: 'cohere/north-mini-code-1-0', options: [effort('none', 'high')] }),
    ).toEqual([]);
  });

  it('offers Off and budget presets', () => {
    const args = {
      modelId: 'cohere/command-a-plus-05-2026',
      options: [toggle, budget(1)],
      outputLimit: 64_000,
    };

    expect(keys(args)).toEqual(['none', 'high', 'max']);
    expect(variant(args, 'high')?.providerOptions).toEqual({
      cohere: { thinking: { type: 'enabled', tokenBudget: 16_000 } },
    });
  });
});

describe('resolveReasoningVariants — unsupported input', () => {
  it('returns nothing for missing or empty options', () => {
    expect(keys({ modelId: 'openai/gpt-5.6', options: undefined })).toEqual([]);
    expect(keys({ modelId: 'openai/gpt-5.6', options: [] })).toEqual([]);
  });

  it('returns nothing for families FrogBot does not route', () => {
    expect(keys({ modelId: 'azure/gpt-5.6', options: [effort('low')] })).toEqual([]);
    expect(keys({ modelId: 'local/qwen', options: [effort('low')] })).toEqual([]);
  });

  it('returns nothing for malformed model IDs', () => {
    expect(keys({ modelId: 'gpt-5.6', options: [effort('low')] })).toEqual([]);
  });

  it('returns provider options callers can mutate safely', () => {
    const args = { modelId: 'anthropic/claude-opus-4-7', options: [effort('low', 'high')] };
    const [low] = resolveReasoningVariants(args);

    Object.assign(low?.providerOptions.anthropic?.thinking as Record<string, unknown>, {
      type: 'disabled',
    });

    expect(variant(args, 'high')?.providerOptions).toEqual({
      anthropic: { thinking: adaptive, effort: 'high' },
    });
  });
});

describe('resolveReasoningVariants — catalog', () => {
  const variants = [...DEFAULT_MODEL_CATALOG.values()].flatMap((entry) =>
    resolveReasoningVariants({
      modelId: entry.id,
      options: entry.capabilities.reasoningOptions,
      outputLimit: entry.context.output,
    }).map((item) => ({ id: entry.id, ...item })),
  );

  it('keeps every variant in a single provider namespace', () => {
    const namespaces = variants.map(({ id, providerOptions }) => [
      id,
      Object.keys(providerOptions),
    ]);

    expect(variants.length).toBeGreaterThan(0);
    expect(namespaces.filter(([, names]) => names.length !== 1)).toEqual([]);
  });

  it('never offers Default as a variant key', () => {
    expect(variants.filter(({ key }) => key === 'default')).toEqual([]);
  });

  it('finds the catalog entry for a provider alias through the public index', () => {
    const id = canonicalizeModelId('bedrock/nova-lite');

    expect(id).toBe('bedrock/amazon.nova-lite-v1:0');
    expect(DEFAULT_MODEL_CATALOG.get(id)?.id).toBe(id);
  });
});
