import { DefaultGeneratedFile } from 'ai';
import { describe, expect, it } from 'vitest';

import { toOpenAIVideosResponse } from './toResponse.js';

describe('toOpenAIVideosResponse', () => {
  it('maps generated files to base64 video data', () => {
    const response = toOpenAIVideosResponse({
      id: 'req_123',
      model: 'replicate/wan-2.5',
      videos: [new DefaultGeneratedFile({ data: 'dmlkZW8=', mediaType: 'video/mp4' })],
    });

    expect(response).toMatchObject({
      id: 'req_123',
      model: 'replicate/wan-2.5',
      data: [{ b64_json: 'dmlkZW8=' }],
    });
    expect(response.created).toEqual(expect.any(Number));
  });

  it('defaults to base64 video responses', () => {
    const response = toOpenAIVideosResponse({
      id: 'req_123',
      model: 'replicate/wan-2.5',
      videos: [new DefaultGeneratedFile({ data: 'dmlkZW8=', mediaType: 'video/mp4' })],
    });

    expect(response.data).toEqual([{ b64_json: 'dmlkZW8=' }]);
  });
});
