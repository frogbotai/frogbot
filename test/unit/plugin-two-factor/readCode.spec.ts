import { describe, expect, it } from 'vitest';

import { readCode } from '../../../packages/plugins/plugin-two-factor/src/codes.js';

describe('two-factor readCode', () => {
  it('reads a string code trimmed, and a whole number with its leading zeros back', () => {
    expect(readCode({ code: ' 123456 ' })).toEqual({ code: '123456' });
    expect(readCode({ code: 46_658 })).toEqual({ code: '046658' });
    expect(readCode({ code: 0 })).toEqual({ code: '000000' });
  });

  it('refuses a missing or mistyped code and an unreadable body', () => {
    for (const code of [undefined, '', '  ', true, 12.5, -1, 1_000_000, ['123456'], null]) {
      expect(readCode({ code }).refused?.code).toBe('code_missing');
    }

    expect(readCode(null).refused?.code).toBe('body_unreadable');
  });
});
