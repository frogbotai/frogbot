import { describe, expect, it, vi } from "vitest";

vi.mock("@frogbotai/gateway", () => ({ calculateModelCostUSD: () => 0.001 }));

import { logUsage } from "./logUsage.js";

describe("logUsage", () => {
  it("persists attribution, grouping, and token partitions without awaiting the write", async () => {
    const create = vi.fn().mockResolvedValue({});
    const req = {
      user: { id: "user-1" },
      payload: { create, logger: { error: vi.fn() } },
    };
    await logUsage({
      phase: "afterOperation",
      requestId: "req-1",
      operation: "chat.completions",
      startedAt: 1,
      context: {
        req,
        agent: { slug: "support", runId: "run-1", threadId: "thread-1" },
      },
      otel: {},
      model: "openai/gpt-4o",
      provider: "openai",
      durationMs: 5,
      finishReason: "stop",
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        cachedInputTokens: 10,
        reasoningTokens: 5,
      },
    } as never);
    await Promise.resolve();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "usage-logs",
        overrideAccess: true,
        data: expect.objectContaining({
          user: "user-1",
          thread: "thread-1",
          requestId: "req-1",
          runId: "run-1",
          inputTokens: 100,
          reasoningTokens: 5,
        }),
      }),
    );
  });
});
