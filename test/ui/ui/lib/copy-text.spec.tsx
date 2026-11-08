import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyText, copyWithTextarea } from '../../../../packages/ui/src/lib/copy-text';

const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function mockClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

function throwingExec() {
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: () => {
      throw new Error('SecurityError');
    },
  });
}

afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

describe('copyWithTextarea', () => {
  it('removes the textarea even when execCommand throws', () => {
    throwingExec();

    expect(() => copyWithTextarea('secret')).toThrow('SecurityError');
    expect(document.querySelector('textarea')).toBeNull();
  });
});

describe('copyText', () => {
  it('resolves false and leaves no textarea when the clipboard and execCommand both throw', async () => {
    mockClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    throwingExec();

    await expect(copyText('secret')).resolves.toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('resolves false and leaves no textarea without a clipboard when execCommand throws', async () => {
    mockClipboard(undefined);
    throwingExec();

    await expect(copyText('x')).resolves.toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});
