import type { ClientField } from 'payload';
import { describe, expect, it } from 'vitest';

import { isKindReadOnly } from '../../../../../packages/ui/src/admin/fields/kind.js';

function field(readOnly?: boolean): ClientField {
  return {
    name: 'price',
    type: 'number',
    ...(readOnly === undefined ? {} : { admin: { readOnly } }),
  } as ClientField;
}

describe('isKindReadOnly', () => {
  it.each([
    ['the prop only', { field: field(), readOnly: true }, true],
    ['the field config only', { field: field(true) }, true],
    ['both', { field: field(true), readOnly: true }, true],
    ['neither', { field: field() }, false],
    ['neither, with both false', { field: field(false), readOnly: false }, false],
    ['the prop, with the field config false', { field: field(false), readOnly: true }, true],
  ])('is read-only from %s: %j', (_, props, expected) => {
    expect(isKindReadOnly(props)).toBe(expected);
  });
});
