import { DefaultGeneratedFile } from 'ai';
import { describe, expect, it } from 'vitest';

import { RequestValidationError } from '../../../errors/gatewayError.js';
import { assertSupportedResponseFormat, toOpenAIImagesResponse } from './toOpenAIResponse.js';

describe('toOpenAIImagesResponse', () => {
  it('maps generated files to b64_json data', () => {
    const response = toOpenAIImagesResponse([
      new DefaultGeneratedFile({ data: 'aW1hZ2U=', mediaType: 'image/png' }),
    ]);

    expect(response.data).toEqual([{ b64_json: 'aW1hZ2U=' }]);
    expect(response.created).toEqual(expect.any(Number));
  });
});

describe('assertSupportedResponseFormat', () => {
  it('rejects url responses', () => {
    expect(() => assertSupportedResponseFormat('url')).toThrow(RequestValidationError);
  });
});
