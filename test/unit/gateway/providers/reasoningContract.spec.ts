import type { SharedV4ProviderOptions } from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withLanguageModelHooks } from '../../../../packages/gateway/src/modelHooks.js';
import { DEFAULT_MODEL_CATALOG } from '../../../../packages/gateway/src/providers/catalog.data.js';
import type { ModelReasoningOption } from '../../../../packages/gateway/src/providers/catalog.js';
import { buildOpenAICompatibleProvider } from '../../../../packages/gateway/src/providers/openai-compatible/index.js';
import {
  resolveReasoningVariants,
  type ResolveReasoningVariantsArgs,
} from '../../../../packages/gateway/src/providers/reasoning.js';
import {
  type GatewayLanguageModel,
  providers,
} from '../../../../packages/gateway/src/providers/registry.js';

const sentUpstream = new Error('sent upstream');
const prompt = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hello' }] }];
const effort = (...values: string[]): ModelReasoningOption => ({ type: 'effort', values });
const toggle: ModelReasoningOption = { type: 'toggle' };

let bodies: Record<string, any>[] = [];

beforeEach(() => {
  bodies = [];

  vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, any>);

    throw sentUpstream;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function languageModel(modelId: string): GatewayLanguageModel {
  const slash = modelId.indexOf('/');
  const provider = modelId.slice(0, slash);
  const name = modelId.slice(slash + 1);

  if (provider === 'local') {
    return buildOpenAICompatibleProvider('local', {
      baseURL: 'http://localhost:1234/v1',
    }).languageModel(name);
  }

  const definition = providers[provider as keyof typeof providers] as {
    build: (config: Record<string, unknown>) => { languageModel: (id: string) => unknown };
  };

  return definition
    .build({ apiKey: 'test', region: 'us-east-1' })
    .languageModel(name) as GatewayLanguageModel;
}

function reasoningVariant(args: ResolveReasoningVariantsArgs & { key: string }) {
  const variant = resolveReasoningVariants(args).find((item) => item.key === args.key);

  if (!variant) throw new Error(`No ${args.key} variant for ${args.modelId}`);

  return variant;
}

async function send(args: {
  modelId: string;
  providerOptions: SharedV4ProviderOptions;
  model?: GatewayLanguageModel;
}): Promise<Record<string, any>> {
  const model = withLanguageModelHooks(args.model ?? languageModel(args.modelId), {
    model: args.modelId,
    operation: 'chat.completions',
    provider: args.modelId.slice(0, args.modelId.indexOf('/')),
  });

  await model
    .doGenerate({ prompt, providerOptions: structuredClone(args.providerOptions) })
    .catch((error: unknown) => {
      if (error !== sentUpstream) throw error;
    });

  const body = bodies.at(-1);

  if (!body) throw new Error(`No request captured for ${args.modelId}`);

  return body;
}

async function sendVariant(args: ResolveReasoningVariantsArgs & { key: string }) {
  return send({ modelId: args.modelId, providerOptions: reasoningVariant(args).providerOptions });
}

describe('reasoning variant wire contract', () => {
  it('OpenAI Responses sends reasoning.effort with a summary', async () => {
    const body = await sendVariant({
      modelId: 'openai/gpt-5.6',
      options: [effort('none', 'high')],
      key: 'high',
    });

    expect(body.reasoning).toEqual({ effort: 'high', summary: 'auto' });
    expect(body.include).toEqual(['reasoning.encrypted_content']);
  });

  it('OpenAI Chat sends reasoning_effort', async () => {
    const variant = reasoningVariant({
      modelId: 'openai/gpt-5.6',
      options: [effort('none', 'high')],
      key: 'high',
    });

    const body = await send({
      modelId: 'openai/gpt-5.6',
      providerOptions: variant.providerOptions,
      model: providers.openai.build({ apiKey: 'test' }).chat('gpt-5.6'),
    });

    expect(body.reasoning_effort).toBe('high');
    expect(body).not.toHaveProperty('reasoning');
  });

  it('Anthropic sends output_config.effort with adaptive thinking', async () => {
    const body = await sendVariant({
      modelId: 'anthropic/claude-opus-4-7',
      options: [effort('low', 'high', 'xhigh', 'max')],
      outputLimit: 128_000,
      key: 'max',
    });

    expect(body.output_config).toEqual({ effort: 'max' });
    expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
  });

  it('Anthropic sends thinking.budget_tokens for budget presets', async () => {
    const body = await sendVariant({
      modelId: 'anthropic/claude-sonnet-4-5',
      options: [{ type: 'budget_tokens', min: 1024 }],
      outputLimit: 64_000,
      key: 'high',
    });

    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 16_000 });
    expect(body).not.toHaveProperty('output_config');
  });

  it('Anthropic Max budget leaves half the output limit for the answer', async () => {
    const body = await sendVariant({
      modelId: 'anthropic/claude-sonnet-4-5',
      options: [{ type: 'budget_tokens', min: 1024 }],
      outputLimit: 64_000,
      key: 'max',
    });

    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 32_000 });
    expect(body.max_tokens - body.thinking.budget_tokens).toBeGreaterThanOrEqual(32_000);
  });

  it('claudeThinkingEffort never adds a budget to an Anthropic max variant', async () => {
    const variant = reasoningVariant({
      modelId: 'anthropic/claude-opus-4-7',
      options: [effort('high', 'max')],
      key: 'max',
    });

    const body = await send({
      modelId: 'anthropic/claude-opus-4-7',
      providerOptions: { ...variant.providerOptions, openai: { reasoning_effort: 'high' } },
    });

    expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(body.output_config).toEqual({ effort: 'max' });
  });

  it('Google sends thinkingConfig.thinkingLevel for Gemini 3', async () => {
    const body = await sendVariant({
      modelId: 'google/gemini-3.6-flash',
      options: [effort('minimal', 'low', 'high')],
      key: 'minimal',
    });

    expect(body.generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'minimal',
    });
  });

  it('Google sends thinkingConfig.thinkingBudget for Gemini 2.5', async () => {
    const body = await sendVariant({
      modelId: 'google/gemini-2.5-pro',
      options: [{ type: 'budget_tokens', min: 128, max: 32_768 }],
      outputLimit: 65_536,
      key: 'max',
    });

    expect(body.generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingBudget: 32_768,
    });
  });

  it('Bedrock sends Claude effort and adaptive thinking as model request fields', async () => {
    const body = await sendVariant({
      modelId: 'bedrock/us.anthropic.claude-opus-4-7',
      options: [toggle, effort('low', 'max')],
      outputLimit: 128_000,
      key: 'max',
    });

    expect(body.additionalModelRequestFields).toEqual({
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'max' },
    });
  });

  it('Bedrock disables Claude thinking for Off', async () => {
    const body = await sendVariant({
      modelId: 'bedrock/us.anthropic.claude-opus-4-7',
      options: [toggle, effort('low', 'max')],
      outputLimit: 128_000,
      key: 'none',
    });

    expect(body.additionalModelRequestFields).toEqual({ thinking: { type: 'disabled' } });
  });

  it('Bedrock sends Nova effort as reasoningConfig', async () => {
    const body = await sendVariant({
      modelId: 'bedrock/us.amazon.nova-2-lite-v1:0',
      options: [toggle, effort('low', 'high')],
      key: 'low',
    });

    expect(body.additionalModelRequestFields).toEqual({
      reasoningConfig: { type: 'enabled', maxReasoningEffort: 'low' },
    });
  });

  it('Bedrock sends Converse GPT Off as reasoning.effort none', async () => {
    const body = await sendVariant({
      modelId: 'bedrock/us.openai.gpt-5.6-luna',
      options: [effort('none', 'low', 'max')],
      key: 'none',
    });

    expect(body.additionalModelRequestFields).toEqual({ reasoning: { effort: 'none' } });
  });

  it('Bedrock Converse GPT efforts use the same reasoning field as Off', async () => {
    const body = await sendVariant({
      modelId: 'bedrock/us.openai.gpt-5.6-luna',
      options: [effort('none', 'low', 'max')],
      key: 'max',
    });

    expect(body.additionalModelRequestFields).toEqual({ reasoning: { effort: 'max' } });
  });

  it('Bedrock Claude Max budget leaves room for the answer', async () => {
    const body = await sendVariant({
      modelId: 'bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      options: [toggle, { type: 'budget_tokens', min: 1024 }],
      outputLimit: 64_000,
      key: 'max',
    });

    expect(body.additionalModelRequestFields.thinking).toEqual({
      type: 'enabled',
      budget_tokens: 32_000,
    });
    expect(body.inferenceConfig.maxTokens).toBeLessThanOrEqual(64_000);
  });

  it('Bedrock Mantle sends Responses reasoning.effort', async () => {
    const body = await sendVariant({
      modelId: 'bedrock/openai.gpt-5.6-luna',
      options: [effort('none', 'high')],
      key: 'high',
    });

    expect(body.reasoning).toEqual({ effort: 'high', summary: 'auto' });
  });

  it('DeepInfra sends reasoning_effort for effort levels', async () => {
    const body = await sendVariant({
      modelId: 'deepinfra/Qwen/Qwen3.8-27B',
      options: [toggle, effort('low', 'xhigh')],
      key: 'xhigh',
    });

    expect(body.reasoning_effort).toBe('xhigh');
    expect(body).not.toHaveProperty('reasoning');
  });

  it('DeepInfra sends reasoning.enabled for Off', async () => {
    const body = await sendVariant({
      modelId: 'deepinfra/Qwen/Qwen3.8-27B',
      options: [toggle, effort('low', 'xhigh')],
      key: 'none',
    });

    expect(body.reasoning).toEqual({ enabled: false });
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('a custom OpenAI-compatible provider reads its own namespace', async () => {
    const body = await sendVariant({
      modelId: 'local/qwen',
      options: [effort('low', 'high')],
      providerOptionsName: 'local',
      key: 'high',
    });

    expect(body.reasoning_effort).toBe('high');
  });

  it('every catalog variant passes the SDK provider option validation', async () => {
    const failures: string[] = [];

    for (const entry of DEFAULT_MODEL_CATALOG.values()) {
      const variants = resolveReasoningVariants({
        modelId: entry.id,
        options: entry.capabilities.reasoningOptions,
        outputLimit: entry.context.output,
      });

      for (const variant of variants) {
        await send({ modelId: entry.id, providerOptions: variant.providerOptions }).catch(
          (error: unknown) => failures.push(`${entry.id} ${variant.key}: ${String(error)}`),
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it('every catalog variant changes the request and differs from its siblings', async () => {
    const ignored: string[] = [];

    for (const entry of DEFAULT_MODEL_CATALOG.values()) {
      const variants = resolveReasoningVariants({
        modelId: entry.id,
        options: entry.capabilities.reasoningOptions,
        outputLimit: entry.context.output,
      });

      if (variants.length === 0) continue;

      const seen = new Set([
        JSON.stringify(await send({ modelId: entry.id, providerOptions: {} })),
      ]);

      for (const variant of variants) {
        const body = JSON.stringify(
          await send({ modelId: entry.id, providerOptions: variant.providerOptions }),
        );

        if (seen.has(body)) ignored.push(`${entry.id} ${variant.key}`);

        seen.add(body);
      }
    }

    expect(ignored).toEqual([]);
  });

  it('Fireworks sends every catalog effort as the offered level', async () => {
    const sent: [string, string][] = [];
    const offered: [string, string][] = [];

    const entries = [...DEFAULT_MODEL_CATALOG.values()].filter((entry) =>
      entry.id.startsWith('fireworks/'),
    );

    for (const entry of entries) {
      const variants = resolveReasoningVariants({
        modelId: entry.id,
        options: entry.capabilities.reasoningOptions,
        outputLimit: entry.context.output,
      });

      for (const variant of variants) {
        const body = await send({ modelId: entry.id, providerOptions: variant.providerOptions });

        offered.push([entry.id, variant.key]);
        sent.push([entry.id, body.reasoning_effort]);
      }
    }

    expect(offered.length).toBeGreaterThan(0);
    expect(sent).toEqual(offered);
  });
});
