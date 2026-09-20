import type { AfterChangeHook, AfterDeleteHook, CollectionConfig, DateField } from 'frogbot';
import { revalidatePath } from 'next/cache';

import type { Post } from './core-context.js';

export const Posts: CollectionConfig = {
  slug: 'posts',
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data?.title) return data;

        return {
          ...data,
          title: data.title.trim(),
        };
      },
    ],
    beforeChange: [
      ({ data, operation }) => {
        if (operation !== 'update' || data.status !== 'published') return data;

        return {
          ...data,
          publishedAt: new Date().toISOString(),
        };
      },
    ],
    afterChange: [({ doc }) => doc],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'status', type: 'select', options: ['draft', 'published'] },
    { name: 'publishedAt', type: 'date' },
  ],
};

export const preserveDocument: AfterChangeHook<Post> = ({ doc }) => {
  return doc;
};

export const publishedOnField: DateField = {
  name: 'publishedOn',
  type: 'date',
  admin: {
    date: { pickerAppearance: 'dayAndTime' },
    position: 'sidebar',
  },
  hooks: {
    beforeChange: [
      ({ siblingData, value }) => {
        if (siblingData._status === 'published' && !value) {
          return new Date().toISOString();
        }

        return value;
      },
    ],
  },
};

export const ContextPosts: CollectionConfig = {
  slug: 'posts',
  hooks: {
    beforeChange: [
      ({ context, data }) => {
        context.normalizedAt = new Date().toISOString();

        return data;
      },
    ],
    afterChange: [
      ({ context, doc }) => {
        if (typeof context.normalizedAt !== 'string') return doc;

        return doc;
      },
    ],
  },
  fields: [{ name: 'title', type: 'text' }],
};

export const HookedPosts: CollectionConfig = {
  slug: 'posts',
  hooks: {
    afterChange: [
      async ({ context, doc, req }) => {
        if (context.syncingPost) return doc;

        await req.frogbot.update({
          collection: 'posts',
          id: doc.id,
          data: { synced: true },
          context: { syncingPost: true },
          req,
        });

        return doc;
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'synced', type: 'checkbox' },
  ],
};

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  hooks: {
    afterLogin: [
      async ({ req, user }) => {
        await req.frogbot.update({
          collection: 'users',
          id: user.id,
          data: {
            lastLogin: new Date().toISOString(),
          },
          req,
        });

        return user;
      },
    ],
  },
  fields: [{ name: 'lastLogin', type: 'date' }],
};

export type RevalidatedPage = {
  id: number | string;
  slug?: string | null;
  _status?: 'draft' | 'published' | null;
};

export const revalidatePage: AfterChangeHook<RevalidatedPage> = ({
  doc,
  previousDoc,
  req: { frogbot, context },
}) => {
  if (context.disableRevalidate) return doc;

  if (doc._status === 'published' && doc.slug) {
    const path = doc.slug === 'home' ? '/' : `/${doc.slug}`;

    frogbot.logger.info(`Revalidating page at path: ${path}`);
    revalidatePath(path);
  }

  if (
    previousDoc?._status === 'published' &&
    previousDoc.slug &&
    (doc._status !== 'published' || previousDoc.slug !== doc.slug)
  ) {
    const oldPath = previousDoc.slug === 'home' ? '/' : `/${previousDoc.slug}`;

    frogbot.logger.info(`Revalidating old page at path: ${oldPath}`);
    revalidatePath(oldPath);
  }

  return doc;
};

export const revalidateDelete: AfterDeleteHook<RevalidatedPage> = ({ doc, req: { context } }) => {
  if (context.disableRevalidate) return doc;

  if (doc.slug) {
    const path = doc.slug === 'home' ? '/' : `/${doc.slug}`;

    revalidatePath(path);
  }

  return doc;
};

export const CachedPages: CollectionConfig = {
  slug: 'pages',
  versions: { drafts: true },
  hooks: {
    afterChange: [revalidatePage],
    afterDelete: [revalidateDelete],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true },
  ],
};
