import { describe, expect, it } from 'vitest';

import { toAnthropicReasoning } from '../../../../packages/gateway/src/shared/toAnthropicReasoning.js';

describe('toAnthropicReasoning', () => {
  it('reads the signature from providerOptions (finalStep.reasoning shape)', () => {
    expect(
      toAnthropicReasoning([
        { type: 'reasoning', text: 'think', providerOptions: { bedrock: { signature: 'sig-b' } } },
      ]),
    ).toEqual([{ text: 'think', signature: 'sig-b' }]);
  });

  it('reads the signature from providerMetadata', () => {
    expect(
      toAnthropicReasoning([
        {
          type: 'reasoning',
          text: 'think',
          providerMetadata: { anthropic: { signature: 'sig-a' } },
        },
      ]),
    ).toEqual([{ text: 'think', signature: 'sig-a' }]);
  });
});
