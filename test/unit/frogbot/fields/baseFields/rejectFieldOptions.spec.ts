import { describe, expect, it } from 'vitest';

import { rejectFieldOptions } from '../../../../../packages/frogbot/src/fields/baseFields/rejectFieldOptions.js';

describe('rejectFieldOptions', () => {
  it('names the factory, field and option', () => {
    expect(() =>
      rejectFieldOptions({
        factory: 'sampleField',
        field: { name: 'size', hasMany: true } as { name: string },
        keys: ['hasMany'],
      }),
    ).toThrow(new Error('sampleField "size": hasMany is not supported'));
  });

  it('reports the first listed option that is set', () => {
    expect(() =>
      rejectFieldOptions({
        factory: 'sampleField',
        field: { name: 'size', maxRows: 2, minRows: 1 } as { name: string },
        keys: ['hasMany', 'minRows', 'maxRows'],
      }),
    ).toThrow(new Error('sampleField "size": minRows is not supported'));
  });

  it.each([false, 0, null, ''])('counts %o as set', (value) => {
    expect(() =>
      rejectFieldOptions({
        factory: 'sampleField',
        field: { name: 'size', hasMany: value } as { name: string },
        keys: ['hasMany'],
      }),
    ).toThrow(new Error('sampleField "size": hasMany is not supported'));
  });

  it('accepts options that are undefined or missing', () => {
    expect(() =>
      rejectFieldOptions({
        factory: 'sampleField',
        field: { name: 'size', hasMany: undefined } as { name: string },
        keys: ['hasMany', 'minRows'],
      }),
    ).not.toThrow();
  });

  it('reads a dotted key from a nested option', () => {
    expect(() =>
      rejectFieldOptions({
        factory: 'sampleField',
        field: { name: 'size', access: { create: () => true } } as { name: string },
        keys: ['access.create'],
      }),
    ).toThrow(new Error('sampleField "size": access.create is not supported'));
  });

  it('accepts a dotted key whose parent is missing', () => {
    expect(() =>
      rejectFieldOptions({
        factory: 'sampleField',
        field: { name: 'size', access: { read: () => true } } as { name: string },
        keys: ['access.create', 'admin.readOnly'],
      }),
    ).not.toThrow();
  });
});
