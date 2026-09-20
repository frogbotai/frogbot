import type { Endpoint, FrogbotInstance } from 'frogbot';
import { buildConfig } from 'frogbot';

import { Pages } from './collections.js';
import { createCoreConfig } from './core-context.js';

export async function localLogin(frogbot: FrogbotInstance) {
  const result = await frogbot.login({
    collection: 'users',
    data: {
      email: 'user@example.com',
      password: 'password',
    },
  });

  return result;
}

export async function restLogin() {
  const response = await fetch('/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'password',
    }),
  });

  return response;
}

export const featuredEndpoint: Endpoint = {
  path: '/featured',
  method: 'get',
  handler: async (req) => {
    const posts = await req.frogbot.find({
      collection: 'posts',
      where: { featured: { equals: true } },
      overrideAccess: false,
      req,
      user: req.user,
    });

    return Response.json(posts);
  },
};

export const livePreviewConfig = buildConfig({
  ...createCoreConfig(),
  collections: [Pages],
  admin: {
    livePreview: {
      collections: ['pages'],
      url: ({ data }) => `/preview/${data.slug}`,
      breakpoints: [
        {
          name: 'mobile',
          label: 'Mobile',
          width: 375,
          height: 667,
        },
      ],
    },
  },
});

export const localizationConfig = buildConfig({
  ...createCoreConfig(),
  localization: { locales: ['en', 'es', 'de'], defaultLocale: 'en', fallback: true },
  collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text', localized: true }] }],
});

export async function findSpanishPosts(frogbot: FrogbotInstance) {
  const posts = await frogbot.find({
    collection: 'posts',
    locale: 'es',
  });

  return posts;
}
