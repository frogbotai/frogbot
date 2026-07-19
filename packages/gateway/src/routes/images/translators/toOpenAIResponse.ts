import type { GeneratedFile } from 'ai';

import { RequestValidationError } from '../../../errors/gatewayError.js';
import type { HookUsage } from '../../../hooks.js';
import type { ImagesRequest } from '../schema.js';

export type OpenAIImagesResponse = {
  created: number;
  data: Array<{ b64_json: string }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
};

export function assertSupportedResponseFormat(responseFormat: ImagesRequest['response_format']) {
  if (responseFormat === 'url') {
    throw new RequestValidationError({
      message: 'response_format=url is not supported; use b64_json',
      param: 'response_format',
    });
  }
}

export function toOpenAIImagesResponse(
  images: GeneratedFile[],
  usage?: HookUsage,
): OpenAIImagesResponse {
  return {
    created: Math.floor(Date.now() / 1000),
    data: images.map((image) => ({ b64_json: image.base64 })),
    ...(usage != null && usage.totalTokens > 0 && {
      usage: {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        total_tokens: usage.totalTokens,
      },
    }),
  };
}
