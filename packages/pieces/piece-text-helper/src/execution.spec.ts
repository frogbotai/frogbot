import { describe, expect, it } from 'vitest';

import { createTextHelper } from './index.js';

const textHelper = createTextHelper();

describe('text helper execution', () => {
  it('executes concat through a FrogBot tool', async () => {
    const concat = textHelper.concat;
    await expect(concat.execute({ texts: ['Frog', 'Bot'], separator: '' }, {} as never)).resolves.toBe('FrogBot');
  });
});
