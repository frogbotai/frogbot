import type { JSONValue } from 'ai';

import { createProviderOptions } from '../../../shared/providerOptions.js';
import type { ImagesRequest } from '../schema.js';

export type GenerateImageParams = {
  prompt: string;
  n?: number;
  size?: `${number}x${number}`;
  providerOptions: Record<string, Record<string, JSONValue>>;
};

export type ToGenerateImageParamsArgs = {
  body: ImagesRequest;
  providerName: string;
};

export function toGenerateImageParams(args: ToGenerateImageParamsArgs): GenerateImageParams {
  const { body, providerName } = args;
  const options: Record<string, JSONValue> = {};
  if (body.quality != null) {
    options.quality = body.quality;
  }
  if (body.style != null) {
    options.style = body.style;
  }
  if (body.user != null) {
    options.user = body.user;
  }
  if (body.background != null) {
    options.background = body.background;
  }
  if (body.moderation != null) {
    options.moderation = body.moderation;
  }
  if (body.output_format != null) {
    options.outputFormat = body.output_format;
  }
  if (body.output_compression != null) {
    options.outputCompression = body.output_compression;
  }
  if (body.size === 'auto') {
    options.size = 'auto';
  }

  return {
    prompt: body.prompt,
    ...(body.n != null && { n: body.n }),
    ...(body.size != null && body.size !== 'auto' && { size: body.size as `${number}x${number}` }),
    providerOptions: createProviderOptions({ providerName, options }),
  };
}
