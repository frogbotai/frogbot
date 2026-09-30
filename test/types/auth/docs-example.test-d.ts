import type { AuthStrategy, CollectionConfig } from 'frogbot';

export const codeStrategy: AuthStrategy = {
  name: 'code-strategy',
  authenticate: async ({ frogbot, headers, req }) => {
    const code = headers.get('code');

    if (!code) {
      return { user: null };
    }

    const usersQuery = await frogbot.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      req,
      where: {
        code: {
          equals: code,
        },
      },
    });

    const user = usersQuery.docs[0];

    return {
      user: user ? { ...user, collection: 'users' } : null,
    };
  },
};

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    disableLocalStrategy: true,
    strategies: [codeStrategy],
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      index: true,
      unique: true,
    },
    {
      name: 'email',
      type: 'text',
    },
  ],
};
