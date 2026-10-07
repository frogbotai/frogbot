import type { Gateway } from '@frogbotai/gateway';
import { experimental_generateVideo as aiGenerateVideo } from 'ai';

import type { Logger } from '../../frogbot.js';
import type { FrogBotRequest } from '../../types/request.js';
import { enforceAIAccess } from '../access.js';
import { enforcePolicy } from '../policy.js';
import { resolveModel } from '../resolve.js';
import type { GenerateVideoOpts, SanitizedAIConfig } from '../types.js';
import { toProviderOptions } from './options.js';

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

  if (shouldEnforceAccess && req) enforcePolicy({ req: req as FrogBotRequest, target: input });
  const modelId = resolveModel(input, config);

  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogBotRequest,
      method: 'generateVideo',
      input,
      config,
    });
  }

  const op = gateway.operation({
    operation: 'videos',
    model: modelId,
    context: { req: req as FrogBotRequest | undefined },
  });

  await op.start();

  try {
    const result = await aiGenerateVideo({
      model: op.videoModel(),
      prompt,
      providerOptions: toProviderOptions(providerOptions),
      abortSignal,
    });

    await op.finish();

    return result;
  } catch (error) {
    await op.finish({ error });
    throw error;
  }
}
