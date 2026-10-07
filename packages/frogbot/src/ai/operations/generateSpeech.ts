import type { Gateway } from '@frogbotai/gateway';
import { experimental_generateSpeech as aiGenerateSpeech } from 'ai';

import type { Logger } from '../../frogbot.js';
import type { FrogBotRequest } from '../../types/request.js';
import { enforceAIAccess } from '../access.js';
import { enforcePolicy } from '../policy.js';
import { resolveModel } from '../resolve.js';
import type { GenerateSpeechOpts, SanitizedAIConfig } from '../types.js';
import { toProviderOptions } from './options.js';

export type GenerateSpeechDeps = {
  gateway: Gateway;
  config: SanitizedAIConfig;
  logger: Logger;
};

export async function generateSpeechOperation(
  deps: GenerateSpeechDeps,
  opts: GenerateSpeechOpts,
): Promise<Awaited<ReturnType<typeof aiGenerateSpeech>>> {
  const { gateway, config } = deps;
  const { model: input, req, overrideAccess, providerOptions, ...aiSdkOpts } = opts;
  const shouldEnforceAccess = overrideAccess === false || (overrideAccess === undefined && !!req);

  if (shouldEnforceAccess && req) enforcePolicy({ req: req as FrogBotRequest, target: input });
  const modelId = resolveModel(input, config);

  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogBotRequest,
      method: 'generateSpeech',
      input,
      config,
    });
  }

  const op = gateway.operation({
    operation: 'speech',
    model: modelId,
    context: { req: req as FrogBotRequest | undefined },
  });

  await op.start();

  try {
    const result = await aiGenerateSpeech({
      ...aiSdkOpts,
      providerOptions: toProviderOptions(providerOptions),
      model: op.speechModel(),
    });

    await op.finish();

    return result;
  } catch (error) {
    await op.finish({ error });
    throw error;
  }
}
