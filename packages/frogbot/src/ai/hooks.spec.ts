import { describe, expect, it } from 'vitest';

import { toGatewayHooks, toHookUsage } from './hooks.js';
import type { SanitizedAIHooks } from '../types/hooks-ai.js';
import type { FrogbotRequest } from '../types/request.js';

function makeHooks(overrides: Partial<SanitizedAIHooks> = {}): SanitizedAIHooks {
  return {
    beforeOperation: [],
    beforeUpstream: [],
    afterUpstream: [],
    afterError: [],
    afterOperation: [],
    ...overrides,
  };
}

function makeReq(): FrogbotRequest {
  return Object.assign(new Request('http://localhost/ai'), {
    user: { id: 'user-1' },
    frogbot: {},
  }) as unknown as FrogbotRequest;
}

describe('toGatewayHooks', () => {
  it('lifts seeded req/user/agent from the context bag onto each phase args', async () => {
    const seen: Record<string, unknown>[] = [];
    const record = (args: Record<string, unknown>) => {
      seen.push(args);
    };
    const gatewayHooks = toGatewayHooks(
      makeHooks({
        beforeOperation: [record],
        beforeUpstream: [record],
        afterUpstream: [record],
        afterError: [record],
        afterOperation: [record],
      }),
    );

    const req = makeReq();
    const agent = { slug: 'support', runId: 'run-1' };
    const context = { req, agent };
    const base = { requestId: 'req_1', operation: 'chat.completions' as const, startedAt: 0, context, otel: {} };

    await gatewayHooks.beforeOperation?.[0]?.({ ...base, phase: 'beforeOperation' });
    await gatewayHooks.beforeUpstream?.[0]?.({
      ...base,
      phase: 'beforeUpstream',
      model: 'openai/test',
      provider: 'openai',
      headers: new Headers(),
      providerOptions: {},
    });
    await gatewayHooks.afterUpstream?.[0]?.({
      ...base,
      phase: 'afterUpstream',
      model: 'openai/test',
      provider: 'openai',
      finishReason: 'stop',
    });
    await gatewayHooks.afterError?.[0]?.({
      ...base,
      phase: 'afterError',
      model: 'openai/test',
      provider: 'openai',
      failedPhase: 'upstream',
      error: new Error('boom'),
    });
    await gatewayHooks.afterOperation?.[0]?.({
      ...base,
      phase: 'afterOperation',
      model: 'openai/test',
      provider: 'openai',
      durationMs: 5,
    });

    expect(seen).toHaveLength(5);
    for (const args of seen) {
      expect(args.req).toBe(req);
      expect(args.user).toEqual({ id: 'user-1' });
      expect(args.agent).toEqual(agent);
    }
  });

  it('is a pure pass-through when the context bag has no seed', async () => {
    let received: Record<string, unknown> | undefined;
    const gatewayHooks = toGatewayHooks(
      makeHooks({ beforeOperation: [(args) => void (received = args)] }),
    );

    await gatewayHooks.beforeOperation?.[0]?.({
      requestId: 'req_1',
      operation: 'embeddings',
      startedAt: 0,
      context: {},
      otel: {},
      phase: 'beforeOperation',
    });

    expect(received?.req).toBeUndefined();
    expect(received?.user).toBeUndefined();
    expect(received?.agent).toBeUndefined();
  });

  it('preserves array lengths across all five phases', () => {
    const gatewayHooks = toGatewayHooks(
      makeHooks({
        beforeOperation: [() => {}],
        beforeUpstream: [() => {}, () => {}],
        afterUpstream: [() => {}],
        afterError: [() => {}],
        afterOperation: [() => {}, () => {}, () => {}],
      }),
    );

    expect(gatewayHooks.beforeOperation).toHaveLength(1);
    expect(gatewayHooks.beforeUpstream).toHaveLength(2);
    expect(gatewayHooks.afterUpstream).toHaveLength(1);
    expect(gatewayHooks.afterError).toHaveLength(1);
    expect(gatewayHooks.afterOperation).toHaveLength(3);
  });
});

describe('toHookUsage', () => {
  it('returns undefined for non-usage values', () => {
    expect(toHookUsage(undefined)).toBeUndefined();
    expect(toHookUsage(null)).toBeUndefined();
    expect(toHookUsage({})).toBeUndefined();
  });

  it('maps a flat token count to input tokens', () => {
    expect(toHookUsage({ tokens: 7 })).toEqual({ inputTokens: 7, outputTokens: 0, totalTokens: 7 });
  });

  it('maps input/output tokens and detail partitions', () => {
    expect(
      toHookUsage({
        inputTokens: 10,
        outputTokens: 4,
        inputTokenDetails: { cacheReadTokens: 3, cacheWriteTokens: 2 },
        outputTokenDetails: { reasoningTokens: 1 },
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
      cachedInputTokens: 3,
      cacheWriteTokens: 2,
      reasoningTokens: 1,
    });
  });
});
