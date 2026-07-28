import { calculateModelCostUSD } from "@frogbotai/gateway";
import type { AfterOperationHook } from "@frogbotai/gateway";

import type { AIOperationContext } from "./hooks.js";
import { USAGE_LOGS_SLUG } from "./usageCollection.js";

export const logUsage: AfterOperationHook = (args) => {
  const context = args.context as AIOperationContext;
  if (context.trackUsage === false) return;
  const req = context.req;
  if (!req || typeof req.payload?.create !== "function") return;
  const usage = args.usage;
  const costUSD = usage ? calculateModelCostUSD(args.model, usage) : 0;
  void req.payload
    .create({
      collection: USAGE_LOGS_SLUG as never,
      data: {
        ...(req.user?.id !== undefined ? { user: req.user.id } : {}),
        ...(context.agent?.threadId !== undefined
          ? { thread: context.agent.threadId }
          : {}),
        requestId: args.requestId,
        runId: context.agent?.runId,
        model: args.model,
        operation: args.operation,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cachedInputTokens: usage?.cachedInputTokens,
        cacheWriteTokens: usage?.cacheWriteTokens,
        reasoningTokens: usage?.reasoningTokens,
        totalTokens: usage?.totalTokens ?? 0,
        costUSD,
        finishReason: args.finishReason,
        requestedAt: new Date(args.startedAt).toISOString(),
      } as never,
      overrideAccess: true,
      req,
    })
    .catch((error: unknown) =>
      req.payload.logger.error(
        { err: error },
        "[frogbot] Failed to log AI usage",
      ),
    );
};
