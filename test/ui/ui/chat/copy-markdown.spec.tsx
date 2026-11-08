import { afterEach, describe, expect, it } from 'vitest';

import { copyMarkdown } from '../../../../packages/ui/src/chat/copy-markdown';

const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

describe('copyMarkdown', () => {
  it('resolves false and leaves no textarea when every copy path fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });

    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: () => {
        throw new Error('SecurityError');
      },
    });

    await expect(copyMarkdown('plain')).resolves.toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
