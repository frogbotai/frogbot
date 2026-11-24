import { describe, expect, it } from 'vitest';

import {
  commentsQuery,
  formatWhen,
  hasContent,
  toCommentItem,
} from '../../../packages/plugins/plugin-comments/src/shared.js';

const root = (...children: Record<string, unknown>[]) => ({ root: { type: 'root', children } });
const paragraph = (...children: Record<string, unknown>[]) => ({ type: 'paragraph', children });

describe('hasContent', () => {
  it('counts text, a mention or an upload, and not blank text or line breaks', () => {
    expect(hasContent(root(paragraph({ type: 'text', text: 'Hi' })))).toBe(true);
    expect(hasContent(root(paragraph({ type: 'mention', value: 7 })))).toBe(true);
    expect(hasContent(root({ type: 'upload', value: 1 }))).toBe(true);
    expect(
      hasContent(root(paragraph({ type: 'text', text: '  ' }), paragraph({ type: 'linebreak' }))),
    ).toBe(false);
    expect(hasContent(root(paragraph()))).toBe(false);
    expect(hasContent(undefined)).toBe(false);
  });
});

describe('commentsQuery', () => {
  it('skips comments older than the record', () => {
    const query = new URLSearchParams(
      commentsQuery({
        collection: 'deals',
        commentsSlug: 'comments',
        documentId: 4,
        since: '2026-01-01T00:00:00.000Z',
      }),
    );

    expect(query.get('where[createdAt][greater_than_equal]')).toBe('2026-01-01T00:00:00.000Z');
    expect(query.get('where[documentId][equals]')).toBe('4');
  });
});

describe('formatWhen', () => {
  const now = Date.parse('2026-11-15T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('says how long ago for the last day, then a date', () => {
    expect(formatWhen(ago(20_000), now, 'en-US')).toBe('Just now');
    expect(formatWhen(ago(60_000), now, 'en-US')).toBe('1 minute ago');
    expect(formatWhen(ago(6 * 60_000), now, 'en-US')).toBe('6 minutes ago');
    expect(formatWhen(ago(3 * 3_600_000), now, 'en-US')).toBe('3 hours ago');
    expect(formatWhen('2026-11-01T12:00:00.000Z', now, 'en-US')).toBe('Nov 1');
    expect(formatWhen('2022-12-11T12:00:00.000Z', now, 'en-US')).toBe('Dec 11, 2022');
  });
});

describe('toCommentItem', () => {
  const base = { id: 1, body: null, createdAt: '2026-11-15T12:00:00.000Z' };

  it('names the author by title field, then their email’s name, and marks later changes as edited', () => {
    const author = { id: 7, email: 'sam@example.com', name: 'Sam Lee' };

    expect(toCommentItem({ ...base, author, updatedAt: base.createdAt }, 'name')).toMatchObject({
      authorEmail: 'sam@example.com',
      authorName: 'Sam Lee',
      edited: false,
    });
    expect(
      toCommentItem(
        { ...base, author: { ...author, name: '' }, updatedAt: '2026-11-15T12:05:00.000Z' },
        'name',
      ),
    ).toMatchObject({ authorName: 'sam', edited: true });
  });

  it('reads a name that is only an email as the email’s name, never the raw email', () => {
    const author = { id: 7, email: 'sam@example.com', name: 'sam@example.com' };

    expect(toCommentItem({ ...base, author }, 'name').authorName).toBe('sam');
    expect(
      toCommentItem({ ...base, author: { id: 7, name: 'sam@example.com' } }, 'name'),
    ).toMatchObject({
      authorName: 'sam',
    });
    expect(
      toCommentItem({ ...base, author: { id: 7, email: 'sam@example.com' } }, undefined),
    ).toMatchObject({
      authorName: 'sam',
    });
  });
});
