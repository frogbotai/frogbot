import { describe, expect, it } from 'vitest';

import {
  EXCERPT_LENGTH,
  excerptOf,
  newlyMentioned,
} from '../../../packages/plugins/plugin-comments/src/mentions.js';

const paragraph = (...children: Record<string, unknown>[]) => ({
  root: {
    type: 'root',
    version: 1,
    children: [{ type: 'paragraph', version: 1, children }],
  },
});

const text = (value: string) => ({ type: 'text', version: 1, text: value, format: 0 });
const mention = (value: number, label: string) => ({
  type: 'mention',
  version: 1,
  value,
  label,
  relationTo: 'users',
});

describe('newlyMentioned', () => {
  it('lists each mention once, minus the author and anyone already mentioned', () => {
    expect(newlyMentioned({ id: 1, author: 9, mentions: [2, 3, 2, 9] }, undefined)).toEqual([
      '2',
      '3',
    ]);
    expect(
      newlyMentioned(
        { id: 1, author: { id: 9 }, mentions: [{ id: 2 }, { id: 4 }] },
        { id: 1, mentions: [2] },
      ),
    ).toEqual(['4']);
    expect(newlyMentioned({ id: 1, author: 9 }, { id: 1, mentions: [2] })).toEqual([]);
  });
});

describe('excerptOf', () => {
  it('prints mentions as @Name and collapses whitespace', () => {
    expect(excerptOf(paragraph(mention(2, 'Sam'), text('  can you\ncheck?')))).toBe(
      '@Sam can you check?',
    );
    expect(excerptOf(null)).toBe('');
  });

  it('clips long text without splitting an emoji', () => {
    const long = excerptOf(paragraph(text('😀'.repeat(EXCERPT_LENGTH + 10))));

    expect(Array.from(long)).toHaveLength(EXCERPT_LENGTH);
    expect(long.endsWith('😀…')).toBe(true);
  });
});
