import { describe, expect, it } from 'vitest';

import type { BeforeUpstreamHookArgs } from '../../../../../packages/gateway/src/hooks.js';
import {
  vertexBeforeUpstream,
  vertexThinkingBudget,
} from '../../../../../packages/gateway/src/providers/vertex/middleware.js';

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
    provider: 'vertex',
    messages: [],
    params: {},
    headers: new Headers(),
    providerOptions: {},
    ...overrides,
  };
}

async function runVertexHooks(args: BeforeUpstreamHookArgs) {
  for (const hook of vertexBeforeUpstream) {
    await hook(args);
  }
}

describe('vertexThinkingBudget', () => {
  const vertexBudget = vertexThinkingBudget('vertex');

  it('maps reasoning_effort to thinkingConfig.thinkingBudget in the given namespace', async () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: { unknown: { reasoning_effort: 'high' } },
      params: { maxOutputTokens: 16384 },
    });

    await vertexBudget(args);

    expect(args.providerOptions['vertex']).toEqual({
      thinkingConfig: { thinkingBudget: 13107 },
    });
    expect(args.providerOptions['google']).toBeUndefined();
  });

  it('writes google when asked, for the AI Gateway creator hook', async () => {
    const args = makeArgs('vercel/google/gemini-2.5-pro', {
      providerOptions: { unknown: { reasoning_effort: 'medium' } },
      params: { maxOutputTokens: 8192 },
    });

    await vertexThinkingBudget('google')(args);

    expect(args.providerOptions['google']).toEqual({
      thinkingConfig: { thinkingBudget: 4096 },
    });
  });

  it('skips non-Gemini models', async () => {
    const args = makeArgs('vertex/claude-3.5-sonnet', {
      providerOptions: { unknown: { reasoning_effort: 'high' } },
    });

    await vertexBudget(args);

    expect(args.providerOptions['vertex']).toBeUndefined();
  });

  it('keeps an explicit thinkingConfig in its namespace', async () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: {
        unknown: { reasoning_effort: 'high' },
        vertex: { thinkingConfig: { thinkingBudget: 999 } },
      },
    });

    await vertexBudget(args);

    expect(args.providerOptions['vertex']).toEqual({ thinkingConfig: { thinkingBudget: 999 } });
  });

  it('skips if no reasoning_effort', async () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: {},
    });

    await vertexBudget(args);

    expect(args.providerOptions['vertex']).toBeUndefined();
  });

  it('applies minimum budget floor', async () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: { unknown: { reasoning_effort: 'low' } },
      params: { maxOutputTokens: 2048 },
    });

    await vertexBudget(args);

    expect(args.providerOptions['vertex']).toEqual({
      thinkingConfig: { thinkingBudget: 1024 },
    });
  });
});

describe('vertexBeforeUpstream', () => {
  it('sends a Gemini thinking budget under vertex and leaves passthrough options for the route', async () => {
    const args = makeArgs('vertex/gemini-3.5-flash', {
      providerOptions: { unknown: { reasoning_effort: 'high', safety_settings: [] } },
      params: { maxOutputTokens: 10_000 },
    });

    await runVertexHooks(args);

    expect(args.providerOptions['vertex']).toEqual({
      thinkingConfig: { thinkingBudget: 8000 },
    });
    expect(args.providerOptions['unknown']).toEqual({
      reasoning_effort: 'high',
      safety_settings: [],
    });
  });

  it('maps a Claude request to Anthropic thinking and re-homes its options under anthropic', async () => {
    const message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'hi',
          providerOptions: { unknown: { cache_control: { type: 'ephemeral' } } },
        },
      ],
    };

    const args = makeArgs('vertex/claude-sonnet-4-6@default', {
      messages: [message] as BeforeUpstreamHookArgs['messages'],
      providerOptions: { unknown: { reasoning_effort: 'high', prompt_cache_key: 'k' } },
      params: { maxOutputTokens: 10_000 },
    });

    await runVertexHooks(args);

    expect(args.providerOptions).toEqual({
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 8000 },
        reasoningEffort: 'high',
        promptCacheKey: 'k',
      },
    });
    expect(message.content[0]?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });

  it('keeps an explicit anthropic.thinking on Claude', async () => {
    const thinking = { type: 'enabled', budgetTokens: 2048 };
    const args = makeArgs('vertex/claude-sonnet-4-6@default', {
      providerOptions: { unknown: { reasoning_effort: 'high' }, anthropic: { thinking } },
    });

    await runVertexHooks(args);

    expect(args.providerOptions['anthropic']?.['thinking']).toEqual(thinking);
  });

  it('treats a vertex id outside the catalog as Gemini', async () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: { unknown: { reasoning_effort: 'high' } },
    });

    await runVertexHooks(args);

    expect(args.providerOptions['vertex']).toHaveProperty('thinkingConfig');
    expect(args.providerOptions['anthropic']).toBeUndefined();
  });
});
