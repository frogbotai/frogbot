// generateSpeech operation — text-to-speech via AI SDK.

import { experimental_generateSpeech as aiGenerateSpeech } from 'ai';

import type { GenerateSpeechOpts, SanitizedAIConfig } from '../../types/ai.js';
import type { FrogbotRequest } from '../../types/request.js';
import type { Logger } from '../../frogbot.js';
import type { Gateway } from '@frogbotai/gateway';
import { resolveModel } from '../resolve.js';
import { enforceAIAccess } from '../access.js';

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
  const { model: input, req, overrideAccess, ...aiSdkOpts } = opts;
  const shouldEnforceAccess = overrideAccess === false || (overrideAccess === undefined && !!req);

  // 1. Resolve model.
  const modelId = resolveModel(input, config);

  // 2. Access control.
  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogbotRequest,
      method: 'generateSpeech',
      input,
      config,
    });
  }

  const op = gateway.operation({
    operation: 'speech',
    model: modelId,
    context: { req: req as FrogbotRequest | undefined },
  });
  await op.start();

  try {
    const result = await aiGenerateSpeech({
      ...aiSdkOpts,
      model: op.speechModel(),
    } as unknown as Parameters<typeof aiGenerateSpeech>[0]);
    await op.finish();
    return result;
  } catch (error) {
    await op.finish({ error });
    throw error;
  }
}
