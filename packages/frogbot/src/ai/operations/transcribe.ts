// transcribe operation — audio-to-text transcription via AI SDK.
// Uses ProxyTranscriptionModel pointed at the proxy URL.

import { transcribe as aiTranscribe } from 'ai';

import type { TranscribeOpts, SanitizedAIConfig } from '../../types/ai.js';
import type { FrogbotRequest } from '../../types/request.js';
import type { Logger } from '../../frogbot.js';
import type { Gateway } from '@frogbotai/gateway';
import { resolveModel } from '../resolve.js';
import { enforceAIAccess } from '../access.js';

export type TranscribeDeps = {
  gateway: Gateway;
  config: SanitizedAIConfig;
  logger: Logger;
};

export async function transcribeOperation(
  deps: TranscribeDeps,
  opts: TranscribeOpts,
): Promise<Awaited<ReturnType<typeof aiTranscribe>>> {
  const { gateway, config } = deps;
  const { model: input, req, overrideAccess, ...aiSdkOpts } = opts;
  const shouldEnforceAccess = overrideAccess === false || (overrideAccess === undefined && !!req);

  // 1. Resolve model.
  const modelId = resolveModel(input, config);

  // 2. Access control.
  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogbotRequest,
      method: 'transcribe',
      input,
      config,
    });
  }

  const op = gateway.operation({
    operation: 'transcriptions',
    model: modelId,
    context: { req: req as FrogbotRequest | undefined },
  });
  await op.start();

  try {
    const result = await aiTranscribe({
      ...aiSdkOpts,
      model: op.transcribeModel(),
    } as unknown as Parameters<typeof aiTranscribe>[0]);
    await op.finish();
    return result;
  } catch (error) {
    await op.finish({ error });
    throw error;
  }
}
