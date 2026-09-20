# FrogBot Hooks

Docs: https://docs.frogbot.ai/hooks/collections, https://docs.frogbot.ai/hooks/fields, and https://docs.frogbot.ai/hooks/context

Hooks run application logic during collection and field lifecycles. FrogBot hook requests expose the running instance as `req.frogbot`.

## Collection lifecycle

For writes, FrogBot runs `beforeValidate`, `beforeChange`, then `afterChange`. Reads run `beforeRead`, then `afterRead`. Deletes run `beforeDelete`, then `afterDelete`.

```ts
import type { CollectionConfig } from 'frogbot';

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
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      options: ['draft', 'published'],
    },
    {
      name: 'publishedAt',
      type: 'date',
    },
  ],
};
```

On updates, `data` contains changed values and can omit the ID and unchanged fields. Read those from `originalDoc` in `beforeValidate` and `beforeChange`, or use `doc` and `previousDoc` in `afterChange`.

## Typed hooks

FrogBot exports concise hook type names.

```ts
import type { AfterChangeHook } from 'frogbot';

import type { Post } from '@/frogbot-types';

export const preserveDocument: AfterChangeHook<Post> = ({ doc }) => {
  return doc;
};
```

Other collection hook types include `BeforeValidateHook`, `BeforeChangeHook`, `BeforeReadHook`, `AfterReadHook`, `BeforeDeleteHook`, `AfterDeleteHook`, `BeforeLoginHook`, `AfterLoginHook`, `AfterLogoutHook`, `AfterForgotPasswordHook`, `RefreshHook`, and `MeHook`.

## Field hooks

Field hooks transform one field value and can inspect adjacent data.

```ts
import type { DateField } from 'frogbot';

export const publishedOnField: DateField = {
  name: 'publishedOn',
  type: 'date',
  admin: {
    date: {
      pickerAppearance: 'dayAndTime',
    },
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
```

Use `FieldHook` when a standalone field callback needs an explicit type.

## Request context

The same request context flows through hooks in one operation. It can carry computed values and loop-prevention flags.

```ts
import type { CollectionConfig } from 'frogbot';

export const Posts: CollectionConfig = {
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
  fields: [
    {
      name: 'title',
      type: 'text',
    },
  ],
};
```

## Nested operations and transactions

Pass the current `req` into nested Local API calls. This preserves the request context and database transaction.

```ts
import type { CollectionConfig } from 'frogbot';

export const Posts: CollectionConfig = {
  slug: 'posts',
  hooks: {
    afterChange: [
      async ({ context, doc, req }) => {
        if (context.syncingPost) return doc;

        await req.frogbot.update({
          collection: 'posts',
          id: doc.id,
          data: {
            synced: true,
          },
          req,
          context: {
            syncingPost: true,
          },
        });

        return doc;
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
    },
    {
      name: 'synced',
      type: 'checkbox',
    },
  ],
};
```

Without the context guard, updating the same collection from `afterChange` can trigger the hook repeatedly. Decide explicitly whether nested calls should enforce permissions; Local API calls override access by default.

## Auth hooks

Auth-enabled collections can run login hooks. Nested writes still receive the current request.

```ts
import type { CollectionConfig } from 'frogbot';

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
  fields: [
    {
      name: 'lastLogin',
      type: 'date',
    },
  ],
};
```

## Next.js cache revalidation

Register change and delete hooks on a versioned collection. Revalidate the current published route, plus the previous route when a page is unpublished or its slug changes. This example maps the `home` slug to `/`.

```ts
import type { AfterChangeHook, AfterDeleteHook, CollectionConfig } from 'frogbot';
import { revalidatePath } from 'next/cache';

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
```

Use the generated application page type in place of the local document shape when available. `revalidatePath` needs a Next.js server request context; for maintenance operations outside Next.js, pass `context: { disableRevalidate: true }` and perform any required cache invalidation through the Next.js application. Suppression applies to both hooks. It does not change access control; keep passing `req` and `overrideAccess: false` for user-scoped nested operations.
