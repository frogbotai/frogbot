import { describe, expect, it } from 'vitest';

import { getFrogbotPopulateFn } from '../../../packages/richtext-lexical/src/features/converters/utilities/frogbotPopulateFn.js';

describe('getFrogbotPopulateFn', () => {
  it('rejects missing framework context', async () => {
    await expect(getFrogbotPopulateFn({ currentDepth: 0, depth: 1 } as never)).rejects.toThrow(
      'exactly one of frogbot or req',
    );
  });
});
