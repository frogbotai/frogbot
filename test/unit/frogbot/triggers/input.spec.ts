import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  encodeSubscriptionInput,
  parseSubscriptionInput,
} from '../../../../packages/frogbot/src/triggers/input.js';

describe('subscription input', () => {
  it('rehydrates transformed values from a persisted raw envelope', () => {
    const schema = z.object({ date: z.string().transform((value) => new Date(value)) });
    const raw = { date: '2026-09-12T00:00:00.000Z' };
    const input = JSON.parse(JSON.stringify(encodeSubscriptionInput(raw)));
    expect(input).toEqual({ value: raw });
    expect(parseSubscriptionInput({ schema, input })).toEqual({ date: new Date(raw.date) });
  });

  it('distinguishes omitted input, null, and an explicitly empty object', () => {
    const schema = z.unknown().transform((value) => (value === undefined ? 'missing' : value));
    const inputs = [undefined, null, {}].map(encodeSubscriptionInput);
    expect(inputs).toEqual([{}, { value: null }, { value: {} }]);
    expect(inputs.map((input) => parseSubscriptionInput({ schema, input }))).toEqual([
      'missing',
      null,
      {},
    ]);
  });

  it('uses undefined defaults first, then the empty-object fallback used by the registry', () => {
    const input = encodeSubscriptionInput(undefined);
    expect(parseSubscriptionInput({ schema: z.string().default('default'), input })).toBe(
      'default',
    );
    expect(
      parseSubscriptionInput({
        schema: z.object({ label: z.string().default('fallback') }),
        input,
      }),
    ).toEqual({ label: 'fallback' });
  });

  it('canonicalizes JSON key order and snapshots raw data before callbacks can mutate it', () => {
    const raw = { z: ['value'], a: { y: 2, x: 1 } };
    const input = encodeSubscriptionInput(raw);
    raw.z.push('changed');
    expect(JSON.stringify(input)).toBe('{"value":{"a":{"x":1,"y":2},"z":["value"]}}');
  });

  it.each([
    new Date(),
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    { nested: undefined },
    [undefined],
    Symbol('value'),
    () => null,
  ])('rejects non-JSON raw input case %#', (input) => {
    expect(() => encodeSubscriptionInput(input)).toThrow(/JSON/);
  });

  it('rejects cyclic raw input', () => {
    const input: Record<string, unknown> = {};
    input.self = input;
    expect(() => encodeSubscriptionInput(input)).toThrow(/cycles/);
  });

  it.each([null, [], 'value', { channel: 'old-ledger-shape' }, { value: undefined }])(
    'rejects malformed persisted input %j',
    (input) => {
      expect(() =>
        parseSubscriptionInput({ schema: z.unknown(), input: input as never }),
      ).toThrow();
    },
  );
});
