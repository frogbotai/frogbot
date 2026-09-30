# FrogBot Collections

Docs: https://docs.frogbot.ai/configuration/collections and https://docs.frogbot.ai/live-preview/overview

Collections define record schemas and expose Local and REST APIs. Register them in `frogbot.config.ts`. GraphQL is opt-in: add the two route files from https://docs.frogbot.ai/graphql/enable to serve collections at `/api/graphql`.

## Basic collection

```ts
import type { CollectionConfig } from 'frogbot';

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      index: true,
    },
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
```

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

import { Posts } from './collections/Posts';
import { Users } from './collections/Users';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  collections: [Users, Posts],
});
```

## Authentication

Set `auth: true` for FrogBot defaults or provide auth options.

```ts
import type { CollectionConfig } from 'frogbot';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    maxLoginAttempts: 5,
    lockTime: 600000,
    tokenExpiration: 7200,
    verify: true,
  },
  admin: {
    useAsTitle: 'email',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
  ],
};
```

Authentication supplies the email and password fields. Add application-specific profile fields yourself. For managed roles, use `@frogbotai/plugin-roles`; see the [roles plugin documentation](https://docs.frogbot.ai/plugins/roles).

## Uploads and the file role

A normal upload collection can configure image processing and metadata:

```ts
import type { CollectionConfig } from 'frogbot';

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
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
};
```

Set `file: true` to adopt a collection as FrogBot's managed file store. FrogBot keeps its slug and merges required upload, folder, soft-delete, admin, and authenticated-access configuration.

## Managed collection roles

FrogBot can adopt application collections for managed storage:

```ts
import type { CollectionConfig } from 'frogbot';

export const Conversations: CollectionConfig = {
  slug: 'conversations',
  chat: true,
  fields: [
    {
      name: 'channel',
      type: 'text',
    },
  ],
};

export const Turns: CollectionConfig = {
  slug: 'turns',
  message: true,
  fields: [],
};
```

The available markers are `chat`, `message`, `file`, and `usageLog`. Mark at most one collection for each role. FrogBot merges missing fields and combines hooks while rejecting incompatible or reserved field definitions.

## Versions and drafts

```ts
import type { CollectionConfig } from 'frogbot';

export const Posts: CollectionConfig = {
  slug: 'posts',
  versions: {
    drafts: {
      autosave: true,
      schedulePublish: true,
      validate: false,
    },
    maxPerDoc: 100,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
  ],
};
```

Draft-aware Local API operations use `draft: true`:

```ts
const post = await frogbot.create({
  collection: 'posts',
  data: {
    title: 'Draft post',
  },
  draft: true,
});

const latest = await frogbot.findByID({
  collection: 'posts',
  id: post.id,
  draft: true,
});
```

When drafts are enabled, `_status` supports `draft` and `published`. Use collection access to decide who can see unpublished records.

## Live preview

`livePreview.url` and `preview` both receive a `FrogBotRequest`, so one helper can build both URLs. `preview` receives the document and `{ locale, req, token }`.

```ts
import type { CollectionConfig, FrogBotRequest } from 'frogbot';

const previewPath = ({ slug, req }: { slug: unknown; req: FrogBotRequest }) =>
  `/preview/${String(slug)}?locale=${req.locale ?? 'en'}`;

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    livePreview: {
      url: ({ data, req }) => previewPath({ slug: data.slug, req }),
    },
    preview: (data, { req }) => previewPath({ slug: data.slug, req }),
  },
  fields: [
    {
      name: 'title',
      type: 'text',
    },
    {
      name: 'slug',
      type: 'text',
    },
  ],
};
```

## Related guidance

- Put reusable lifecycle behavior in the [hooks documentation](https://docs.frogbot.ai/hooks/overview).
- Enforce document and field permissions with the [access control documentation](https://docs.frogbot.ai/access-control/overview).
- Local API calls skip access checks unless `overrideAccess: false` is set.
