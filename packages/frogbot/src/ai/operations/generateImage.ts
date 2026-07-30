// generateImage operation — image generation via AI SDK.

import type { Gateway } from '@frogbotai/gateway';
import { generateImage as aiGenerateImage } from 'ai';

import type { Logger } from '../../frogbot.js';
import type { GenerateImageOpts, SanitizedAIConfig } from '../../types/ai.js';
import type { FrogbotRequest } from '../../types/request.js';
import { enforceAIAccess } from '../access.js';
import { toHookUsage } from '../hooks.js';
import { resolveModel } from '../resolve.js';

export type GenerateImageDeps = {
  gateway: Gateway;
  config: SanitizedAIConfig;
  logger: Logger;
};

export async function generateImageOperation(
  deps: GenerateImageDeps,
  opts: GenerateImageOpts,
): Promise<Awaited<ReturnType<typeof aiGenerateImage>>> {
  const { gateway, config } = deps;
  const { model: input, req, overrideAccess, ...aiSdkOpts } = opts;
  const shouldEnforceAccess = overrideAccess === false || (overrideAccess === undefined && !!req);

  // 1. Resolve model.
  const modelId = resolveModel(input, config);

  // 2. Access control.
  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogbotRequest,
      method: 'generateImage',
      input,
      config,
    });
  }

  const op = gateway.operation({
    operation: 'images',
    model: modelId,
    context: { req: req as FrogbotRequest | undefined },
  });
  await op.start();

  try {
    const result = await aiGenerateImage({
      ...aiSdkOpts,
      model: op.imageModel(),
    } as unknown as Parameters<typeof aiGenerateImage>[0]);
    await op.finish({ usage: toHookUsage(result.usage) });
    return result;
  } catch (error) {
    await op.finish({ error });
    throw error;
  }
}
