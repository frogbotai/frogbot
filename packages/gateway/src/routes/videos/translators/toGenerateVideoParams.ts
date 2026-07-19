import type { JSONValue } from 'ai';

import { createProviderOptions } from '../../../shared/providerOptions.js';
import type { VideosRequest } from '../schema.js';

export type GenerateVideoParams = {
  prompt: string;
  n?: number;
  aspectRatio?: `${number}:${number}`;
  resolution?: `${number}x${number}`;
  duration?: number;
  fps?: number;
  seed?: number;
  generateAudio?: boolean;
  providerOptions: Record<string, Record<string, JSONValue>>;
};

export type ToGenerateVideoParamsArgs = {
  body: VideosRequest;
  providerName: string;
};

export function toGenerateVideoParams(args: ToGenerateVideoParamsArgs): GenerateVideoParams {
  const { body, providerName } = args;
  const options: Record<string, JSONValue> = {};
  const pollTimeoutMs = body.poll_timeout_ms ?? body.timeout_ms;
  if (pollTimeoutMs != null) options.pollTimeoutMs = pollTimeoutMs;
  if (body.poll_interval_ms != null) options.pollIntervalMs = body.poll_interval_ms;

  return {
    prompt: body.prompt,
    ...(body.n != null && { n: body.n }),
    ...(body.aspect_ratio != null && {
      aspectRatio: body.aspect_ratio as `${number}:${number}`,
    }),
    ...(body.resolution != null && {
      resolution: body.resolution as `${number}x${number}`,
    }),
    ...(body.duration != null && { duration: body.duration }),
    ...(body.fps != null && { fps: body.fps }),
    ...(body.seed != null && { seed: body.seed }),
    ...(body.generate_audio != null && { generateAudio: body.generate_audio }),
    providerOptions: createProviderOptions({ providerName, options }),
  };
}
