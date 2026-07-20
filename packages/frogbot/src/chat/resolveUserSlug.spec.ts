import { describe, expect, it } from 'vitest';

import type { CollectionConfig } from '../types/collection.js';
import { resolveUserSlug } from './resolveUserSlug.js';

function make(collections: CollectionConfig[], adminUser?: string) {
  return { collections, admin: adminUser ? { user: adminUser } : undefined };
}

describe('resolveUserSlug', () => {
  it("falls back to Payload's default 'users' when no auth collection exists", () => {
    expect(resolveUserSlug(make([{ slug: 'posts', fields: [] }]))).toBe('users');
    expect(resolveUserSlug(make([]))).toBe('users');
  });

  it('uses the single auth collection regardless of slug', () => {
    expect(resolveUserSlug(make([{ slug: 'members', auth: true, fields: [] }]))).toBe('members');
  });

  it('treats an auth options object as auth enabled', () => {
    expect(resolveUserSlug(make([{ slug: 'accounts', auth: { verify: true }, fields: [] }]))).toBe('accounts');
  });

  it('treats auth: false as not an auth collection', () => {
    expect(resolveUserSlug(make([{ slug: 'members', auth: false, fields: [] }]))).toBe('users');
  });

  it('uses admin.user when multiple auth collections exist', () => {
    const collections: CollectionConfig[] = [
      { slug: 'admins', auth: true, fields: [] },
      { slug: 'customers', auth: true, fields: [] },
    ];
    expect(resolveUserSlug(make(collections, 'customers'))).toBe('customers');
  });

  it('throws when multiple auth collections exist and admin.user is unset', () => {
    const collections: CollectionConfig[] = [
      { slug: 'admins', auth: true, fields: [] },
      { slug: 'customers', auth: true, fields: [] },
    ];
    expect(() => resolveUserSlug(make(collections))).toThrow(
      '[frogbot] Multiple auth collections found (admins, customers). ' +
        'Set `admin.user` to the slug of your user collection.',
    );
  });

  it('throws when admin.user names a non-auth collection', () => {
    const collections: CollectionConfig[] = [
      { slug: 'admins', auth: true, fields: [] },
      { slug: 'customers', auth: true, fields: [] },
    ];
    expect(() => resolveUserSlug(make(collections, 'posts'))).toThrow(
      "[frogbot] `admin.user` is 'posts' but no auth collection has that slug (found: admins, customers).",
    );
  });
});
