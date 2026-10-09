import type * as Gateway from '@frogbotai/gateway';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@frogbotai/gateway', async (importOriginal) => ({
  ...(await importOriginal<typeof Gateway>()),
  calculateModelCostUSD: vi.fn(() => 0.001),
}));

import { calculateModelCostUSD } from '@frogbotai/gateway';

import { logUsage } from '../../../../packages/frogbot/src/ai/logUsage.js';

const providers = {
  custom: {
    type: 'openai-compatible',
    baseUrl: 'http://127.0.0.1/v1',
    models: [{ id: 'priced', mode: 'chat', cost: { input: 1, output: 2 } }],
  },
};

function makeReq({
  create = vi.fn().mockResolvedValue({}),
  user,
}: {
  create?: ReturnType<typeof vi.fn>;
  user?: { id: string };
} = {}) {
  const usageReq = { frogbot: { create } };
  const createRequest = vi.fn().mockResolvedValue(usageReq);
  const error = vi.fn();

  const req = {
    user,
    context: { source: 'test' },
    frogbot: { config: { ai: { providers } }, create: vi.fn(), createRequest, logger: { error } },
  };

  return { req, usageReq, create, createRequest, error };
}

describe('logUsage', () => {
  it('persists attribution, grouping, and token partitions without awaiting the write', async () => {
    const { req, usageReq, create, createRequest } = makeReq({
      create: vi.fn(() => new Promise(() => {})),
      user: { id: 'user-1' },
    });

    const returned = logUsage({
      phase: 'afterOperation',
      requestId: 'req-1',
      operation: 'chat.completions',
      startedAt: 1,
      context: {
        req,
        agent: { slug: 'support', runId: 'run-1', chatId: 'chat-1' },
      },
      otel: {},
      model: 'openai/gpt-4o',
      provider: 'openai',
      durationMs: 5,
      finishReason: 'stop',
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        cachedInputTokens: 10,
        reasoningTokens: 5,
      },
    } as never);

    expect(returned).toBeUndefined();

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());

    expect(createRequest).toHaveBeenCalledWith({ user: req.user, context: req.context });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'usage-logs',
        overrideAccess: true,
        req: usageReq,
        data: expect.objectContaining({
          user: 'user-1',
          chat: 'chat-1',
          requestId: 'req-1',
          runId: 'run-1',
          inputTokens: 100,
          reasoningTokens: 5,
        }),
      }),
    );
  });

  it('writes on a detached request instead of the caller request', async () => {
    const { req, create } = makeReq();

    await logUsage({
      requestId: 'req-4',
      operation: 'chat.completions',
      startedAt: 1,
      context: { req },
      model: 'openai/gpt-4o',
    } as never);

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());

    expect(req.frogbot.create).not.toHaveBeenCalled();
  });

  it('composes generic usage fields into the existing write', async () => {
    const { req, create } = makeReq();

    await logUsage({
      requestId: 'req-2',
      operation: 'chat.completions',
      startedAt: 1,
      context: { req, usageFields: { apiKey: 'key-9', requestId: 'wrong' } },
      model: 'openai/gpt-4o',
    } as never);

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());

    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      apiKey: 'key-9',
      requestId: 'req-2',
    });
  });

  it('omits contributor fields when none are supplied', async () => {
    const { req, create } = makeReq();

    await logUsage({
      requestId: 'req-3',
      operation: 'chat.completions',
      startedAt: 1,
      context: { req },
      model: 'openai/gpt-4o',
    } as never);

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());

    expect(create.mock.calls[0]?.[0].data).not.toHaveProperty('apiKey');
  });

  it('prices a custom model with its configured cost', async () => {
    const { req, create } = makeReq();

    await logUsage({
      requestId: 'req-7',
      operation: 'chat.completions',
      startedAt: 1,
      context: { req },
      model: 'custom/priced',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 },
    } as never);

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());

    expect(create.mock.calls[0]?.[0].data.costUSD).toBe(3);
  });

  it('prices other models from the built-in price list', async () => {
    const { req, create } = makeReq();

    await logUsage({
      requestId: 'req-8',
      operation: 'chat.completions',
      startedAt: 1,
      context: { req },
      model: 'openai/gpt-4o',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    } as never);

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());

    expect(create.mock.calls[0]?.[0].data.costUSD).toBe(0.001);
  });

  it('stores a Vertex Claude row with its full id and catalog cost', async () => {
    const actual = await vi.importActual<typeof Gateway>('@frogbotai/gateway');
    vi.mocked(calculateModelCostUSD).mockImplementationOnce(actual.calculateModelCostUSD);
    const { req, create } = makeReq();

    await logUsage({
      requestId: 'req-9',
      operation: 'chat.completions',
      startedAt: 1,
      context: { req },
      model: 'vertex/claude-sonnet-4-6@default',
      provider: 'vertex',
      usage: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 },
    } as never);

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());

    const data = create.mock.calls[0]?.[0].data;

    expect(data.model).toBe('vertex/claude-sonnet-4-6@default');
    expect(data.costUSD).toBeGreaterThan(0);
    expect(data.costUSD).not.toBe(0.001);
  });

  it('logs a failed write without surfacing it to the operation', async () => {
    const failure = new Error('write failed');
    const { req, error } = makeReq({ create: vi.fn().mockRejectedValue(failure) });

    await logUsage({
      requestId: 'req-5',
      operation: 'chat.completions',
      startedAt: 1,
      context: { req },
      model: 'openai/gpt-4o',
    } as never);

    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());

    expect(error).toHaveBeenCalledWith({ err: failure }, '[frogbot] Failed to log AI usage');
  });

  it('skips the write when usage tracking is disabled', async () => {
    const { req, createRequest } = makeReq();

    await logUsage({
      requestId: 'req-6',
      operation: 'chat.completions',
      startedAt: 1,
      context: { req, trackUsage: false },
      model: 'openai/gpt-4o',
    } as never);

    expect(createRequest).not.toHaveBeenCalled();
  });
});
