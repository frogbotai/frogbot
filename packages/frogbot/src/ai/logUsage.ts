import type { AfterOperationHook } from '@frogbotai/gateway';

import { calculateUsageCostUSD } from './cost.js';
import type { AIOperationContext } from './hooks.js';
import { USAGE_LOGS_SLUG } from './usage/collection.js';

export const logUsage: AfterOperationHook = (args) => {
  const context = args.context as AIOperationContext;
  if (context.trackUsage === false) return;
  const req = context.req;
  if (!req) return;

  const usage = args.usage;
  const costUSD = usage
    ? calculateUsageCostUSD({
        model: args.model,
        providers: req.frogbot.config?.ai?.providers,
        usage,
      })
    : 0;

  void req.frogbot
    .createRequest({ user: req.user, context: req.context })
    .then((usageReq) =>
      usageReq.frogbot.create({
        collection: req.frogbot.config?.ai?.usage?.slug ?? USAGE_LOGS_SLUG,
        data: {
          ...(context.usageFields ?? {}),
          ...(req.user?.id !== undefined ? { user: req.user.id } : {}),
          ...(context.agent?.chatId !== undefined ? { chat: context.agent.chatId } : {}),
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
        },
        overrideAccess: true,
        req: usageReq,
      }),
    )
    .catch((error: unknown) =>
      req.frogbot.logger.error({ err: error }, '[frogbot] Failed to log AI usage'),
    );
};
