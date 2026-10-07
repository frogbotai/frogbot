import { describe, expect, it } from 'vitest';

import {
  toImageSize,
  toProviderOptions,
} from '../../../../../packages/frogbot/src/ai/operations/options.js';

describe('toProviderOptions', () => {
  it('passes undefined through', () => {
    expect(toProviderOptions(undefined)).toBeUndefined();
  });

  it('returns valid provider options unchanged', () => {
    const options = {
      openai: { reasoningEffort: 'low', store: false, n: 2, user: null, extra: undefined },
      anthropic: { thinking: { type: 'enabled', budgetTokens: 1024 }, tags: ['a', 1, [true]] },
      empty: Object.create(null),
    };

    expect(toProviderOptions(options)).toBe(options);
  });

  it.each([
    ['a string', 'low'],
    ['an array', [{ a: 1 }]],
    ['a class instance', new Date(0)],
    ['a nested function', { onChunk: () => undefined }],
    ['a nested class instance', { since: new Date(0) }],
    ['an undefined array item', { list: [undefined] }],
    ['a bigint', { n: 1n }],
  ])('rejects a provider entry holding %s, naming the key', (_label, entry) => {
    expect(() => toProviderOptions({ openai: { store: true }, bad: entry })).toThrow(
      new TypeError('[frogbot] providerOptions.bad must be a plain object of JSON values.'),
    );
  });

  it('drops absent provider entries', () => {
    expect(
      toProviderOptions({ openai: { store: true }, anthropic: undefined, google: null }),
    ).toEqual({ openai: { store: true } });
  });

  it('rejects circular provider entries', () => {
    const entry: Record<string, unknown> = {};
    entry.self = entry;

    expect(() => toProviderOptions({ openai: entry })).toThrow(
      '[frogbot] providerOptions.openai must be a plain object of JSON values.',
    );
  });

  it('accepts repeated (non-circular) references', () => {
    const shared = { a: 1 };
    const options = { openai: { x: shared, y: shared, list: [shared, shared] } };

    expect(toProviderOptions(options)).toBe(options);
  });
});

describe('toImageSize', () => {
  it('passes undefined through', () => {
    expect(toImageSize(undefined)).toBeUndefined();
  });

  it('returns a {width}x{height} size unchanged', () => {
    expect(toImageSize('1024x768')).toBe('1024x768');
  });

  it.each(['1024', '1024X768', '1024 x 768', 'x768', '1024x', '-1x2', '1.5x2', 'auto'])(
    'rejects %j',
    (size) => {
      expect(() => toImageSize(size)).toThrow(
        new TypeError(
          `[frogbot] Image size must be '{width}x{height}' (e.g. '1024x1024'), got '${size}'.`,
        ),
      );
    },
  );
});
