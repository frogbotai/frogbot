import type { LanguageModelV4 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { fixIncompleteFinishReason } from '../../../../../packages/gateway/src/providers/xai/index.js';

function fakeModel(raw: string, body: unknown): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'xai.responses',
    modelId: 'grok-4.3',
    supportedUrls: {},
    doGenerate: async () =>
      ({
        content: [],
        finishReason: { unified: 'other', raw },
        usage: {},
        warnings: [],
        response: { body },
      }) as never,
    doStream: async () => ({}) as never,
  } as LanguageModelV4;
}

describe('fixIncompleteFinishReason', () => {
  it('maps incomplete + max_output_tokens to length', async () => {
    const model = fixIncompleteFinishReason(
      fakeModel('incomplete', { incomplete_details: { reason: 'max_output_tokens' } }),
    );
    const result = await model.doGenerate({ prompt: [] } as never);
    expect(result.finishReason).toEqual({ unified: 'length', raw: 'incomplete' });
  });

  it('leaves other finish reasons untouched', async () => {
    const model = fixIncompleteFinishReason(fakeModel('completed', {}));
    const result = await model.doGenerate({ prompt: [] } as never);
    expect(result.finishReason.unified).toBe('other');
    expect(model.modelId).toBe('grok-4.3');
  });
});
