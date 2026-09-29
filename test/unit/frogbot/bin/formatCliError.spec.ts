import { describe, expect, it } from 'vitest';

import { formatCliError } from '../../../../packages/frogbot/src/bin/formatCliError.js';

describe('formatCliError', () => {
  it('adds the `[frogbot]` prefix to an unprefixed message', () => {
    expect(formatCliError(new Error('boom'))).toBe('[frogbot] boom');
  });

  it('keeps a single prefix when the message already has one', () => {
    expect(formatCliError(new Error('[frogbot] `secret` is required and must be a string.'))).toBe(
      '[frogbot] `secret` is required and must be a string.',
    );
  });

  it('places context between the prefix and an unprefixed message', () => {
    expect(formatCliError(new Error('boom'), 'migrate:status failed')).toBe(
      '[frogbot] migrate:status failed: boom',
    );
  });

  it('drops the inner prefix when context is added to a prefixed message', () => {
    expect(
      formatCliError(new Error("[frogbot] Unknown admin icon 'hmoe'."), 'migrate failed'),
    ).toBe("[frogbot] migrate failed: Unknown admin icon 'hmoe'.");
  });

  it('formats non-Error values', () => {
    expect(formatCliError('[frogbot] stale')).toBe('[frogbot] stale');
  });
});
