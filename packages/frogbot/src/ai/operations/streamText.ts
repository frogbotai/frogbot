// streamText operation — async pre-checks, then returns the stream.

import { generateId, streamText as aiStreamText } from 'ai';
import type { LanguageModelUsage } from 'ai';
import type { Gateway } from '@frogbotai/gateway';

import type { StreamTextOpts, SanitizedAIConfig } from '../../types/ai.js';
import type { FrogbotRequest } from '../../types/request.js';
import type { Frogbot, Logger } from '../../frogbot.js';
import { toAISDKTools, toAISDKToolsContext } from '../../agents/tools.js';
import { resolveModel } from '../resolve.js';
import { enforceAIAccess } from '../access.js';
import { toHookUsage } from '../hooks.js';

export type StreamTextDeps = {
  gateway: Gateway;
  config: SanitizedAIConfig;
  frogbot: Frogbot;
  logger: Logger;
};

export async function streamTextOperation(
  deps: StreamTextDeps,
  opts: StreamTextOpts,
): Promise<ReturnType<typeof aiStreamText>> {
  const { gateway, config, frogbot } = deps;
  const { model: input, req, overrideAccess, tools, onFinish, onEnd, onError, onAbort, ...aiSdkOpts } = opts;
  const shouldEnforceAccess = overrideAccess === false || (overrideAccess === undefined && !!req);

  // 1. Resolve model (router slug → model ID).
  const modelId = resolveModel(input, config);

  // 2. Access control.
  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogbotRequest,
      method: 'streamText',
      input,
      config,
    });
  }

  const op = gateway.operation({
    operation: 'chat.completions',
    model: modelId,
    context: { req: req as FrogbotRequest | undefined },
  });
  const userEnd = onEnd ?? onFinish;
  const aiTools = toAISDKTools(tools);
  const toolReq = tools?.length ? await frogbot.createRequest(req) : undefined;
  const toolsContext = toolReq
    ? toAISDKToolsContext(tools, {
        req: toolReq,
        frogbot,
        agent: { slug: 'direct', runId: generateId() },
      })
    : undefined;

  await op.start();

  try {
    return aiStreamText({
      ...aiSdkOpts,
      model: op.chatModel(),
      ...(tools?.length && { tools: aiTools, toolsContext }),
      onEnd: async (event: { usage: LanguageModelUsage; finishReason: string }) => {
        await op.finish({
          finishReason: event.finishReason,
          usage: toHookUsage(event.usage),
        });
        if (userEnd) {
          await userEnd(event);
        }
      },
      onError: async (event: { error: unknown }) => {
        await op.finish({ error: event.error });
        if (onError) {
          await onError(event);
        }
      },
      onAbort: async (event: unknown) => {
        await op.finish({
          error: opts.abortSignal?.reason ?? new DOMException('The operation was aborted', 'AbortError'),
        });
        if (onAbort) {
          await onAbort(event);
        }
      },
    } as unknown as Parameters<typeof aiStreamText>[0]);
  } catch (error) {
    await op.finish({ error });
    throw error;
  }
}
