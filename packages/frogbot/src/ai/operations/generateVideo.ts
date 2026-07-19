// generateVideo operation — text-to-video via AI SDK.

import { experimental_generateVideo as aiGenerateVideo } from 'ai';
import type { Gateway } from '@frogbotai/gateway';

import type { GenerateVideoOpts, SanitizedAIConfig } from '../../types/ai.js';
import type { FrogbotRequest } from '../../types/request.js';
import type { Logger } from '../../frogbot.js';
import { resolveModel } from '../resolve.js';
import { enforceAIAccess } from '../access.js';

export type GenerateVideoDeps = {
  gateway: Gateway;
  config: SanitizedAIConfig;
  logger: Logger;
};

export async function generateVideoOperation(
  deps: GenerateVideoDeps,
  opts: GenerateVideoOpts,
): Promise<Awaited<ReturnType<typeof aiGenerateVideo>>> {
  const { gateway, config } = deps;
  const { model: input, req, overrideAccess, prompt, providerOptions, abortSignal } = opts;
  const shouldEnforceAccess = overrideAccess === false || (overrideAccess === undefined && !!req);

  // 1. Resolve model.
  const modelId = resolveModel(input, config);

  // 2. Access control.
  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogbotRequest,
      method: 'generateVideo',
      input,
      config,
    });
  }

  const op = gateway.operation({
    operation: 'videos',
    model: modelId,
    context: { req: req as FrogbotRequest | undefined },
  });
  await op.start();

  try {
    const result = await aiGenerateVideo({
      model: op.videoModel(),
      prompt,
      providerOptions,
      abortSignal,
    } as unknown as Parameters<typeof aiGenerateVideo>[0]);
    await op.finish();
    return result;
  } catch (error) {
    await op.finish({ error });
    throw error;
  }
}
