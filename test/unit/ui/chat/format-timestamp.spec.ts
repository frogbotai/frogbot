import { describe, expect, it } from 'vitest';

import { formatMessageTimestamp } from '../../../../packages/ui/src/chat/format-timestamp';

const now = new Date(2026, 2, 14, 18, 58);

describe('formatMessageTimestamp', () => {
  it('uses the weekday for messages within the last seven days', () => {
    expect(formatMessageTimestamp(new Date(2026, 2, 14, 18, 58), now)).toBe('Saturday 6:58 PM');
    expect(formatMessageTimestamp(new Date(2026, 2, 9, 9, 5), now)).toBe('Monday 9:05 AM');
  });

  it('uses month and day for older messages in the current year', () => {
    expect(formatMessageTimestamp(new Date(2026, 0, 12, 18, 58), now)).toBe('Jan 12 6:58 PM');
  });

  it('includes the year for messages from a previous year', () => {
    expect(formatMessageTimestamp(new Date(2025, 0, 12, 18, 58), now)).toBe('Jan 12, 2025 6:58 PM');
  });

  it('returns an empty string for an invalid value', () => {
    expect(formatMessageTimestamp('not-a-date', now)).toBe('');
  });
});
