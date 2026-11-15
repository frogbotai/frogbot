import { describe, expect, it } from 'vitest';

import { commentsQuery, hasContent } from '../../../packages/plugins/plugin-comments/src/shared.js';

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
