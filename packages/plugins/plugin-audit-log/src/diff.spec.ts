import { describe, expect, it } from 'vitest';

import { computeChanges } from './diff.js';

describe('computeChanges', () => {
  it('returns shallow field changes and ignores timestamps', () => {
    expect(
      computeChanges(
        { title: 'Before', nested: { value: 1 }, updatedAt: 'old' },
        { title: 'After', nested: { value: 2 }, updatedAt: 'new' },
      ),
    ).toEqual({
      title: { old: 'Before', new: 'After' },
      nested: { old: { value: 1 }, new: { value: 2 } },
    });
  });

  it('preserves added and removed field boundaries after JSON serialization', () => {
    const changes = computeChanges(
      { removed: 'before', unchanged: true },
      { added: 'after', unchanged: true },
    );

    expect(JSON.parse(JSON.stringify(changes))).toEqual({
      removed: { old: 'before', new: null },
      added: { old: null, new: 'after' },
    });
  });
});
