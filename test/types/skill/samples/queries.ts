import type { AfterChangeHook, FrogBotInstance, FrogBotRequest, SelectType, Where } from 'frogbot';
import { buildConfig, getFrogBot } from 'frogbot';

import { createCoreConfig, type Post } from './core-context.js';

export const query: Where = {
  and: [
    { status: { equals: 'published' } },
    {
      or: [{ title: { contains: 'release' } }, { category: { in: ['news', 'updates'] } }],
    },
    { publishedAt: { less_than_equal: new Date().toISOString() } },
  ],
};

export const nestedQuery: Where = {
  'author.role': { equals: 'editor' },
  'meta.featured': { exists: true },
};

export async function localAPI() {
  const config = buildConfig(createCoreConfig());
  const frogbot = await getFrogBot({ config });

  const posts = await frogbot.find({
    collection: 'posts',
    where: { status: { equals: 'published' } },
    depth: 1,
    limit: 10,
    page: 1,
    sort: '-createdAt',
  });

  const post = await frogbot.findByID({
    collection: 'posts',
    id: '123',
    depth: 1,
  });

  await frogbot.create({
    collection: 'posts',
    data: { title: 'New post', status: 'draft' },
  });

  await frogbot.update({
    collection: 'posts',
    id: '123',
    data: { status: 'published' },
  });

  await frogbot.delete({
    collection: 'posts',
    id: '123',
  });

  const count = await frogbot.count({
    collection: 'posts',
    where: { status: { equals: 'published' } },
  });

  return { posts, post, count };
}

export const select = {
  title: true,
  author: true,
  meta: { featured: true },
} satisfies SelectType;

export async function findPosts(frogbot: FrogBotInstance) {
  const posts = await frogbot.find({
    collection: 'posts',
    select,
  });

  return posts;
}

export const excludeSelect = {
  internalNotes: false,
  meta: { privateLabel: false },
} satisfies SelectType;

export async function accessControl({
  frogbot,
  currentUser,
}: {
  frogbot: FrogBotInstance;
  currentUser: FrogBotRequest['user'];
}) {
  const posts = await frogbot.find({
    collection: 'posts',
    user: currentUser,
    overrideAccess: false,
  });

  return posts;
}

export const createAuditEvent: AfterChangeHook<Post> = async ({ doc, req }) => {
  await req.frogbot.create({
    collection: 'audit-events',
    data: { action: 'post-created', document: doc.id },
    req,
  });

  return doc;
};

export async function restAPI() {
  const params = new URLSearchParams({
    'where[status][equals]': 'published',
    limit: '10',
    sort: '-createdAt',
  });

  const response = await fetch(`/api/posts?${params}`);
  const result = await response.json();

  return result;
}
