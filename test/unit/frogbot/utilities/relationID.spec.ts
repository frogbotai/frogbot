import { describe, expect, it } from 'vitest';

import { relationID } from '../../../../packages/frogbot/src/utilities/relationID.js';

describe('relationID', () => {
  it.each([
    ['a bare numeric ID', 7, 7],
    ['a bare string ID', 'abc', 'abc'],
    ['an empty string', '', null],
    ['null', null, null],
    ['undefined', undefined, null],
    ['a populated doc with a numeric id', { id: 7, title: 'x' }, 7],
    ['a populated doc with a string id', { id: 'abc' }, 'abc'],
    ['a populated doc with an empty id', { id: '' }, null],
    ['a populated doc with a null id', { id: null }, null],
    ['a populated doc with no id', { title: 'x' }, null],
    ['a non-ID primitive', true, null],
    ['an array', [7], null],
  ])('reads %s', (_, value, expected) => {
    expect(relationID(value)).toBe(expected);
  });
});
