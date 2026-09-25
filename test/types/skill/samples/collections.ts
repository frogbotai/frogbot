import type { CollectionConfig, FrogBotInstance } from 'frogbot';
import { buildConfig } from 'frogbot';

import { createCoreConfig } from './core-context.js';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    maxLoginAttempts: 5,
    lockTime: 600000,
    tokenExpiration: 7200,
    verify: true,
  },
  admin: { useAsTitle: 'email' },
  fields: [{ name: 'name', type: 'text', required: true }],
};

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', required: true, index: true },
    {
      name: 'status',
      type: 'select',
      options: ['draft', 'published'],
      defaultValue: 'draft',
    },
  ],
  defaultSort: '-createdAt',
  timestamps: true,
};

export const collectionConfig = buildConfig({
  ...createCoreConfig(),
  collections: [Users, Posts],
});

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    mimeTypes: ['image/*'],
    imageSizes: [
      {
        name: 'thumbnail',
        width: 400,
        height: 300,
        position: 'centre',
      },
    ],
    adminThumbnail: 'thumbnail',
    focalPoint: true,
    crop: true,
  },
  access: { read: () => true },
  fields: [{ name: 'alt', type: 'text', required: true }],
};

export const Conversations: CollectionConfig = {
  slug: 'conversations',
  chat: true,
  fields: [{ name: 'channel', type: 'text' }],
};

export const Turns: CollectionConfig = {
  slug: 'turns',
  message: true,
  fields: [],
};

export const DraftPosts: CollectionConfig = {
  slug: 'posts',
  versions: {
    drafts: {
      autosave: true,
      schedulePublish: true,
      validate: false,
    },
    maxPerDoc: 100,
  },
  fields: [{ name: 'title', type: 'text', required: true }],
};

export async function createDraft(frogbot: FrogBotInstance) {
  const post = await frogbot.create({
    collection: 'posts',
    data: { title: 'Draft post' },
    draft: true,
  });

  const latest = await frogbot.findByID({
    collection: 'posts',
    id: post.id,
    draft: true,
  });

  return { post, latest };
}

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    livePreview: { url: ({ data }) => `/preview/${data.slug}` },
    preview: (data) => `/preview/${data.slug}`,
  },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'slug', type: 'text' },
  ],
};
