# FrogBot Collections

Docs: https://docs.frogbot.ai/configuration/collections and https://docs.frogbot.ai/live-preview/overview

Collections define record schemas and expose Local and REST APIs. Register them in `frogbot.config.ts`. GraphQL is opt-in: add the two route files from https://docs.frogbot.ai/graphql/enable to serve collections at `/api/graphql`.

## Basic collection

```ts
import type { CollectionConfig } from 'frogbot';

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    icon: 'newspaper',
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

## Icons

Set `admin.icon` on every collection that shows in the sidebar. Without one it shows a folder, and `frogbot check` warns `MISSING_ICON`. Auth collections default to `people`, but write it out. Collections with `admin.hidden` or `admin.group: false` don't need one.

| Kind     | Names                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------- |
| People   | `people`, `profile`, `user-add`, `ai-user`, `mail`                                                        |
| Content  | `file`, `newspaper`, `book-open`, `bookmark`, `scroll`, `pencil-edit`, `message-square-text`, `megaphone` |
| Media    | `image`, `video`, `palette`, `layers`                                                                     |
| Work     | `briefcase`, `check-list`, `calendar`, `clock`, `flag`, `ticket`, `lightbulb`, `robot`                    |
| Commerce | `receipt`, `coins`, `shopping-cart`, `package`, `tag`, `chart-bar`                                        |
| Places   | `map-pin`, `building`, `home`, `web`                                                                      |
| Settings | `setting`, `shield`, `key-round`, `lock`, `database`, `link-square`, `code`                               |

A collection about one platform takes its logo, always with the `brand-` prefix: `brand-twitter` for an X swipe file, `brand-youtube` for a channel list, `brand-git-hub` for repos. Everything else takes a UI icon. Your editor autocompletes every built-in name, and an unknown name stops startup with the full list. For anything else, point at a component: `icon: './src/components/LeadsIcon#LeadsIcon'`.

## Views and done records

`admin.views` lists a collection's views; the first is the default and a list view must come first. Every view renders in one frame with a tab row (icon and label), one toolbar and one empty state. Keep view entries plain data: `filter` is a `Where`, React components go in `components`, and `access` is the only function. Each user's filters, sort, columns, page size and grouping are saved per view, with **Reset to default** in the view menu. A list view's `summary` sets each column's default footer total across every page (`count`, `sum`, `avg`, `min`, `max`; numbers take all five, dates `count`, `min` and `max`, other fields `count`); people change it from the footer, and startup fails on an unknown path or a pairing the field can't take. A list view's `editable` lets people edit cells in place, like a spreadsheet: `true` for every supported column, or an array of field names or dot paths. Text, textarea, email, number, select, checkbox, date, single relationship fields and every field kind edit in the cell with the field's own input (Enter saves, Esc cancels, Tab moves on and wraps rows); `hasMany`, other types, the linked first column and fields the person can't update open the record instead. Saves are one normal `PATCH` (drafts save as drafts). Startup fails on an entry that isn't a field or never edits in a cell (richText, array, blocks, group, tabs, upload, join, autonumber). Docs: https://docs.frogbot.ai/admin/collection-list#editing-cells-in-place

```ts
export const Tasks: CollectionConfig = {
  slug: 'tasks',
  admin: {
    useAsTitle: 'title',
    useAsDone: 'completed',
    views: [
      {
        type: 'list',
        defaultFields: ['title', 'status', 'dueDate'],
        editable: ['status', 'dueDate'],
        groupBy: 'status',
        summary: { title: 'count' },
      },
      { type: 'board', groupBy: 'status', icon: 'kanban', filter: { archived: { equals: false } } },
      {
        type: 'calendar',
        start: 'dueDate',
        components: { NoResults: '/components/NoTasks#NoTasks' },
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'status', type: 'select', options: ['todo', 'doing', 'done'] },
    { name: 'completed', type: 'checkbox' },
    { name: 'archived', type: 'checkbox' },
    { name: 'dueDate', type: 'date' },
  ],
};
```

A list or board `groupBy` follows one set of rules: select and radio groups in option order with every option shown, checkbox as true then false, other fields by the values present, and records without a value in one last group. A list opens grouped by its `groupBy` until a person picks their own grouping; each list group collapses (saved per person), shows its count and has **+ Add**, which prefills the group's value. Hide a field from grouping with `admin.disabled.groupBy`.

`admin.useAsDone` names one checkbox field (or a dot path into a group); startup fails if it isn't a checkbox. Done records share one done style on every view, and board cards get a check circle that toggles it through a normal update. To make a stage imply done, set the checkbox in a `beforeChange` hook rather than in config. Docs: https://docs.frogbot.ai/configuration/collections#collection-views

Clicking a row, card or event opens the record in a side panel beside the view, at `?record=<id>`, with the edit form. It's on for every collection; `admin.panel: false` opens the edit page instead. `admin.panel.properties` lists the fields shown as label and value rows under the title (default: the sidebar fields), and `admin.panel.width` sets the starting width (400–960, default 560). Panel slots go in `admin.components.panel`: `actions`, `beforeFields`, `afterFields`, `Header`, `Component`. Docs: https://docs.frogbot.ai/admin/record-panel

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
    icon: 'people',
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

A normal upload collection limits its file types and adds its own metadata. Register `sharpTransformer` from `@frogbotai/transformer-sharp` under `upload.transformers` when you need image `variants` or resizing.

```ts
import type { CollectionConfig } from 'frogbot';

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    mimeTypes: ['image/*'],
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

Set `file: true` to adopt a collection as FrogBot's managed file store. FrogBot adds no files collection otherwise, and pieces that create files fail without one. FrogBot keeps its slug and merges required upload, folder, soft-delete, admin, and authenticated-access configuration.

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
  overrideAccess: true,
  data: {
    title: 'Draft post',
  },
  draft: true,
});

const latest = await frogbot.findByID({
  collection: 'posts',
  overrideAccess: true,
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
- Local API calls enforce access checks by default (`overrideAccess: false`); pass `overrideAccess: true` only for trusted server work.
