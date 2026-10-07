// transcribe operation — audio-to-text transcription via AI SDK.
// Uses ProxyTranscriptionModel pointed at the proxy URL.

import { type Gateway, toTranscriptionLanguageOptions } from '@frogbotai/gateway';
import { transcribe as aiTranscribe } from 'ai';

import type { Logger } from '../../frogbot.js';
import type { FrogBotRequest } from '../../types/request.js';
import { enforceAIAccess } from '../access.js';
import { enforcePolicy } from '../policy.js';
import { resolveModel } from '../resolve.js';
import type { SanitizedAIConfig, TranscribeAudio, TranscribeOpts } from '../types.js';
import { toProviderOptions } from './options.js';

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
  const {
    model: input,
    req,
    overrideAccess,
    audio,
    language,
    providerOptions,
    ...aiSdkOpts
  } = opts;

  const shouldEnforceAccess = overrideAccess === false || (overrideAccess === undefined && !!req);

  // 1. Resolve model.
  if (shouldEnforceAccess && req) enforcePolicy({ req: req as FrogBotRequest, target: input });
  const modelId = resolveModel(input, config);

  // 2. Access control.
  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogBotRequest,
      method: 'transcribe',
      input,
      config,
    });
  }

  const audioData = await toAudioData(audio);
  const providerName = modelId.slice(0, modelId.indexOf('/'));

  const resolvedProviderOptions =
    language == null
      ? providerOptions
      : {
          ...providerOptions,
          [providerName]: {
            ...toTranscriptionLanguageOptions({ providerName, language }),
            ...(providerOptions?.[providerName] as Record<string, unknown> | undefined),
          },
        };

  const op = gateway.operation({
    operation: 'transcriptions',
    model: modelId,
    context: { req: req as FrogBotRequest | undefined },
  });
  await op.start();

  try {
    const result = await aiTranscribe({
      ...aiSdkOpts,
      audio: audioData,
      providerOptions: toProviderOptions(resolvedProviderOptions),
      model: op.transcribeModel(),
    });
    await op.finish();
    return result;
  } catch (error) {
    await op.finish({ error });
    throw error;
  }
}

async function toAudioData(audio: TranscribeAudio) {
  if (audio instanceof Blob) return new Uint8Array(await audio.arrayBuffer());

  if (audio instanceof ReadableStream) {
    return new Uint8Array(await new Response(audio).arrayBuffer());
  }

  return audio;
}
