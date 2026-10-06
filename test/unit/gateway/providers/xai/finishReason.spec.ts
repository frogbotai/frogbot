import type { LanguageModelV4 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { fixIncompleteFinishReason } from '../../../../../packages/gateway/src/providers/xai/index.js';

function fakeModel(raw: string, body: unknown): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'xai.responses',
    modelId: 'grok-4.3',
    supportedUrls: {},
    doGenerate: () =>
      Promise.resolve({
        content: [],
        finishReason: { unified: 'other', raw },
        usage: {
          inputTokens: {
            total: undefined,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: undefined, text: undefined, reasoning: undefined },
        },
        warnings: [],
        response: { body },
      }),
    doStream: () => Promise.reject(new Error('doStream is not used by these tests')),
  };
}

describe('fixIncompleteFinishReason', () => {
  it('maps incomplete + max_output_tokens to length', async () => {
    const model = fixIncompleteFinishReason(
      fakeModel('incomplete', { incomplete_details: { reason: 'max_output_tokens' } }),
    );
    const result = await model.doGenerate({ prompt: [] });
    expect(result.finishReason).toEqual({ unified: 'length', raw: 'incomplete' });
  });

  it('leaves other finish reasons untouched', async () => {
    const model = fixIncompleteFinishReason(fakeModel('completed', {}));
    const result = await model.doGenerate({ prompt: [] });
    expect(result.finishReason.unified).toBe('other');
    expect(model.modelId).toBe('grok-4.3');
  });
});
