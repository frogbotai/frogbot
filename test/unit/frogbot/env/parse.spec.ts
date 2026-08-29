import { describe, expect, it } from 'vitest';

import { parseBoolean, parseEnum, parseNumber, parseString } from '../../../../packages/frogbot/src/env/parse.js';

describe('env parsers', () => {
  it('parses strings', () => {
    expect(parseString('value')).toEqual({ success: true, value: 'value' });
  });

  it('parses zero as a number', () => {
    expect(parseNumber('0')).toEqual({ success: true, value: 0 });
  });

  it('rejects invalid numbers', () => {
    expect(parseNumber('abc')).toEqual({ error: 'must be a number', success: false });
  });

  it.each(['1', 'on', 't', 'true', 'TRUE', 'y', 'yes'])('parses %s as true', (raw) => {
    expect(parseBoolean(raw)).toEqual({ success: true, value: true });
  });

  it.each(['0', 'f', 'false', 'FALSE', 'n', 'no', 'off'])('parses %s as false', (raw) => {
    expect(parseBoolean(raw)).toEqual({ success: true, value: false });
  });

  it('rejects invalid booleans', () => {
    expect(parseBoolean('enabled')).toEqual({ error: 'must be a boolean', success: false });
  });

  it('parses enum members', () => {
    expect(parseEnum(['one', 'two'] as const, 'two')).toEqual({
      success: true,
      value: 'two',
    });
  });

  it('rejects values outside an enum', () => {
    expect(parseEnum(['one', 'two'] as const, 'three')).toEqual({
      error: 'must be one of: one, two',
      success: false,
    });
  });
});
