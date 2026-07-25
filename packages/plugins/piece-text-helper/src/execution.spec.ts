import { describe, expect, it } from 'vitest';

import { textHelper } from './index.js';

describe('text helper execution', () => {
  it('executes concat through a FrogBot tool', async () => {
    const [concat] = textHelper.tools({ actions: ['concat'] });
    await expect(concat.execute({ texts: ['Frog', 'Bot'], separator: '' }, {} as never)).resolves.toBe('FrogBot');
  });
});
