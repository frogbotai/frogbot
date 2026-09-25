import { describe, expect, it } from 'vitest';

import { getFrogBotPopulateFn } from '../../../packages/richtext-lexical/src/features/converters/utilities/frogbotPopulateFn.js';

describe('getFrogBotPopulateFn', () => {
  it('rejects missing framework context', async () => {
    await expect(getFrogBotPopulateFn({ currentDepth: 0, depth: 1 } as never)).rejects.toThrow(
      'exactly one of frogbot or req',
    );
  });
});
