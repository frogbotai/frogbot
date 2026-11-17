import { describe, expect, it } from 'vitest';

import {
  EXCERPT_LENGTH,
  excerptOf,
  mentionChanges,
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

describe('mentionChanges', () => {
  it('lists each new mention once, minus the author and anyone the comment notified before', () => {
    expect(mentionChanges({ author: 9, mentions: [2, 3, 2, 9], notified: undefined })).toEqual({
      fresh: ['2', '3'],
      notified: [2, 3],
    });
    expect(
      mentionChanges({ author: { id: 9 }, mentions: [{ id: 2 }, { id: 4 }], notified: [2] }),
    ).toEqual({ fresh: ['4'], notified: [2, 4] });
  });

  it('keeps a removed mention in notified, so adding it back is not new', () => {
    const removed = mentionChanges({ author: 9, mentions: [], notified: [2] });

    expect(removed).toEqual({ fresh: [], notified: [2] });
    expect(mentionChanges({ author: 9, mentions: [2], notified: removed.notified }).fresh).toEqual(
      [],
    );
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
