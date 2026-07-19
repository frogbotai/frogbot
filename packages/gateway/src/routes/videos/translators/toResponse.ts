import type { GeneratedFile } from 'ai';

import { RequestValidationError } from '../../../errors/gatewayError.js';
import type { VideosRequest } from '../schema.js';

export type OpenAIVideosResponse = {
  id: string;
  created: number;
  model: string;
  data: Array<{ b64_json: string }>;
};

export function assertSupportedResponseFormat(responseFormat: VideosRequest['response_format']) {
  if (responseFormat === 'url') {
    throw new RequestValidationError({
      message: 'response_format=url is not supported; use b64_json',
      param: 'response_format',
    });
  }
}

export function toOpenAIVideosResponse(args: {
  id: string;
  model: string;
  videos: GeneratedFile[];
}): OpenAIVideosResponse {
  return {
    id: args.id,
    created: Math.floor(Date.now() / 1000),
    model: args.model,
    data: args.videos.map((video) => ({ b64_json: video.base64 })),
  };
}
