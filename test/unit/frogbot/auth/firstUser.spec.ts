import { describe, expect, it } from 'vitest';

import { firstUser } from '../../../../packages/frogbot/src/auth/firstUser.js';

describe('firstUser', () => {
  it('builds a create call with a fresh random password and no verification email', () => {
    const one = firstUser({ collection: { slug: 'users', auth: true }, email: 'a@b.co' });
    const two = firstUser({ collection: { slug: 'users', auth: true }, email: 'a@b.co' });

    expect(one.password).toMatch(/^[\w-]{43}$/);
    expect(two.password).not.toBe(one.password);
    expect(one.create).toEqual({
      collection: 'users',
      data: { email: 'a@b.co', password: one.password },
      disableVerificationEmail: true,
      overrideAccess: true,
      depth: 0,
    });
  });

  it('marks the user verified when the collection verifies email, and keeps extra data', () => {
    const { create, password } = firstUser({
      collection: { slug: 'admins', auth: { verify: true } },
      email: 'a@b.co',
      data: { name: 'Ada', password: 'ignored', email: 'ignored' },
    });

    expect(create.data).toEqual({ name: 'Ada', email: 'a@b.co', password, _verified: true });
  });
});
