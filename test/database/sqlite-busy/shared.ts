import { type CollectionConfig, definePiece } from 'frogbot';
import { z } from 'zod';

import { openAccess } from '../../__helpers/shared/buildTestConfig.js';

export const notesSlug = 'notes';

export const membersSlug = 'members';

export const postsSlug = 'posts';

export function notesCollection(hooks?: CollectionConfig['hooks']): CollectionConfig {
  return { slug: notesSlug, access: openAccess, hooks, fields: [{ name: 'title', type: 'text' }] };
}

const identity = definePiece({
  slug: 'identity',
  label: 'Identity',
  auth: z.object({ accessToken: z.string() }),
  client: ({ auth }: { auth: unknown }) => auth,
  oauth: {
    authorizationUrl: 'https://identity.example.com/authorize',
    tokenUrl: 'https://identity.example.com/token',
    scopes: { catalog: { openid: 'openid', email: 'email' }, defaults: ['openid', 'email'] },
    account: () =>
      Promise.resolve({ id: 'identity', label: 'Identity', email: 'person@example.com' }),
  },
  actions: [],
})({ oauth: { clientId: 'client', clientSecret: 'secret' } });

export function membersCollection(hooks?: CollectionConfig['hooks']): CollectionConfig {
  return {
    slug: membersSlug,
    auth: { signIn: [identity] },
    access: { read: () => true },
    hooks,
    fields: [],
  };
}

export const postsCollection: CollectionConfig = {
  slug: postsSlug,
  access: openAccess,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'tags', type: 'array', fields: [{ name: 'name', type: 'text' }] },
    { name: 'related', type: 'relationship', relationTo: notesSlug, hasMany: true },
    { name: 'kind', type: 'select', hasMany: true, options: ['a', 'b'] },
  ],
};
