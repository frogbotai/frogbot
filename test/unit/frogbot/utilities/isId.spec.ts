import { describe, expect, it } from 'vitest';

import { isId } from '../../../../packages/frogbot/src/utilities/isId.js';

describe('isId', () => {
  it.each([1, 0, 'abc'])('accepts %j', (value) => {
    expect(isId(value)).toBe(true);
  });

  it.each(['', 1.5, NaN, Infinity, null, undefined, true, {}, []])('rejects %j', (value) => {
    expect(isId(value)).toBe(false);
  });
});
