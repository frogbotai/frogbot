import { describe, expect, it, vi } from 'vitest';

vi.mock('@frogbotai/gateway', () => ({ calculateModelCostUSD: () => 0.001 }));

import { logUsage } from '../../../../packages/frogbot/src/ai/logUsage.js';

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
    frogbot: { create: vi.fn(), createRequest, logger: { error } },
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

    logUsage({
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

    logUsage({
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

    logUsage({
      requestId: 'req-3',
      operation: 'chat.completions',
      startedAt: 1,
      context: { req },
      model: 'openai/gpt-4o',
    } as never);

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());

    expect(create.mock.calls[0]?.[0].data).not.toHaveProperty('apiKey');
  });

  it('logs a failed write without surfacing it to the operation', async () => {
    const failure = new Error('write failed');
    const { req, error } = makeReq({ create: vi.fn().mockRejectedValue(failure) });

    logUsage({
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

    logUsage({
      requestId: 'req-6',
      operation: 'chat.completions',
      startedAt: 1,
      context: { req, trackUsage: false },
      model: 'openai/gpt-4o',
    } as never);

    expect(createRequest).not.toHaveBeenCalled();
  });
});
