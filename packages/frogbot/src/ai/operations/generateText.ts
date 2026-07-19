// generateText operation — reference pattern for all AI operations.

import { generateId, generateText as aiGenerateText } from 'ai';
import type { Gateway } from '@frogbotai/gateway';

import type { GenerateTextOpts, SanitizedAIConfig } from '../../types/ai.js';
import type { FrogbotRequest } from '../../types/request.js';
import type { Frogbot, Logger } from '../../frogbot.js';
import { toAISDKTools, toAISDKToolsContext } from '../../agents/tools.js';
import { resolveModel } from '../resolve.js';
import { enforceAIAccess } from '../access.js';
import { toHookUsage } from '../hooks.js';

export type GenerateTextDeps = {
  gateway: Gateway;
  config: SanitizedAIConfig;
  frogbot: Frogbot;
  logger: Logger;
};

export async function generateTextOperation(
  deps: GenerateTextDeps,
  opts: GenerateTextOpts,
): Promise<Awaited<ReturnType<typeof aiGenerateText>>> {
  const { gateway, config, frogbot } = deps;
  const { model: input, req, overrideAccess, tools, ...aiSdkOpts } = opts;
  const shouldEnforceAccess = overrideAccess === false || (overrideAccess === undefined && !!req);

  // 1. Resolve model.
  const modelId = resolveModel(input, config);

  // 2. Access control.
  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogbotRequest,
      method: 'generateText',
      input,
      config,
    });
  }

  const aiTools = toAISDKTools(tools);
  const toolReq = tools?.length ? await frogbot.createRequest(req) : undefined;
  const toolsContext = toolReq
    ? toAISDKToolsContext(tools, {
        req: toolReq,
        frogbot,
        agent: { slug: 'direct', runId: generateId() },
      })
    : undefined;

  const op = gateway.operation({
    operation: 'chat.completions',
    model: modelId,
    context: { req: req as FrogbotRequest | undefined },
  });
  await op.start();

  try {
    const result = await aiGenerateText({
      ...aiSdkOpts,
      model: op.chatModel(),
      ...(tools?.length && { tools: aiTools, toolsContext }),
    } as unknown as Parameters<typeof aiGenerateText>[0]);
    await op.finish({
      finishReason: result.finishReason,
      usage: toHookUsage(result.usage),
    });
    return result;
  } catch (error) {
    await op.finish({ error });
    throw error;
  }
}
