# FrogBot Advanced Features

Docs: https://docs.frogbot.ai/authentication/overview, https://docs.frogbot.ai/custom-components/overview, https://docs.frogbot.ai/live-preview/overview, and https://docs.frogbot.ai/configuration/localization

## Authentication

Auth-enabled collections expose login and account endpoints. Server-side code can use the Local API:

```ts
const result = await frogbot.login({
  collection: 'users',
  data: {
    email: 'user@example.com',
    password: 'password',
  },
});
```

The equivalent REST request is:

```ts
const response = await fetch('/api/users/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password',
  }),
});
```

## Custom Endpoints

Root and collection endpoints use native Web Request/Response semantics:

```ts
import type { Endpoint } from 'frogbot';

const featuredEndpoint: Endpoint = {
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
```

See the [custom endpoints skill reference](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/ENDPOINTS.md) for placement, authentication, and the Next.js Web Request/Response route.

## Custom Admin UI

### First screen and navigation

Shape the first screen and the sidebar around the app's main work in every app you build. Without this, the admin opens on one card per collection, Users included, and the sidebar lists Users beside the real work.

- List the app's main collections in the sidebar. With more than a handful, group them with `admin.group: 'Label'`.
- Set `admin.settings: true` on Users and other admin collections. Each gets its own Settings sidebar item and opens with the Settings sidebar; it leaves the main sidebar, the dashboard's collection cards, Recents and Pinned, and the command palette finds it under Settings. Use `admin.group: false` for other collections people open rarely, and `admin.hidden` only for collections nobody should open in the admin.
- Set `admin.dashboard.defaultLayout` so the first screen shows the work people come for, such as open tasks or new orders, then Recents and Pinned and the collection cards.
- Build widgets and views from FrogBot's components and theme tokens, and hide plumbing fields, as [ADMIN-DESIGN.md](ADMIN-DESIGN.md) describes.

```ts
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { settings: true },
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
};
```

```ts
admin: {
  dashboard: {
    widgets: [],
    defaultLayout: [
      { widgetSlug: 'welcome', width: 'full' },
      {
        widgetSlug: 'collection-query',
        width: 'full',
        data: {
          title: 'Open tasks',
          relatedCollection: 'tasks',
          where: { status: { not_equals: 'done' } },
          sortField: 'dueDate',
          sortDirection: 'asc',
          limit: 5,
        },
      },
      { widgetSlug: 'activity', width: 'full' },
      { widgetSlug: 'collections', width: 'full' },
    ],
  },
},
```

The built-in widgets are `welcome`, `collection-query` (a short filtered list of one collection), `activity` (Recents and Pinned), `collections` (the cards) and, with an upload collection, `upload-dropzone`. Add your own in `widgets`. A user who saves their own layout from the dashboard editor keeps it, so changes to `defaultLayout` reach only users who haven't saved one or who reset theirs. See the [dashboard docs](https://docs.frogbot.ai/custom-components/dashboard).

### Components and views

Component references are import paths. A path can name an export with `#ExportName`. This example places `Welcome` above the sidebar links using `beforeNavLinks` and registers a reports view:

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

import { Posts } from './collections/Posts';
import { Users } from './collections/Users';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  collections: [Users, Posts],
  admin: {
    components: {
      beforeNavLinks: ['/components/Welcome#Welcome'],
      views: {
        reports: {
          Component: '/components/ReportsView#ReportsView',
          path: '/reports',
          exact: true,
        },
      },
    },
  },
});
```

Root views receive `AdminViewServerProps`. Use the request and permissions in `initPageResult` for authorization, and use `DefaultTemplate` to retain the standard Admin Panel shell:

```tsx
import { notFound, redirect } from 'next/navigation';

import { DefaultTemplate } from '@frogbotai/ui/admin/rsc';
import type { AdminViewServerProps } from 'frogbot';

export function ReportsView({ initPageResult, params, searchParams, user }: AdminViewServerProps) {
  const { permissions, req, visibleEntities } = initPageResult;

  if (!req.user) {
    redirect('/login');
  }

  if (!permissions.canAccessAdmin) {
    notFound();
  }

  return (
    <DefaultTemplate
      req={req}
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      permissions={permissions}
      searchParams={searchParams}
      user={user}
      visibleEntities={visibleEntities}
    >
      <main>
        <h1>Reports</h1>
      </main>
    </DefaultTemplate>
  );
}
```

The standard FrogBot App Router files are:

```text
src/app/(frogbot)/layout.tsx
src/app/(frogbot)/[[...segments]]/page.tsx
src/app/(frogbot)/[[...segments]]/not-found.tsx
src/app/(frogbot)/api/[...slug]/route.ts
src/app/(frogbot)/api/v1/[[...slug]]/route.ts
```

Use `RootLayout` and `handleServerFunctions` from `@frogbotai/next/layouts`, and `RootPage`, `NotFoundPage`, and `generatePageMetadata` from `@frogbotai/next/views`.

## Live Preview

Enable Live Preview at the root for selected collections:

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

import { Pages } from './collections/Pages';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
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
```

The `url` function receives `data`, `locale`, `collectionConfig`, and `req`; the FrogBot instance is at `req.frogbot`. A collection may instead define `admin.livePreview`, which overrides root settings for that collection.

For a Next.js server-rendered preview, authenticate the visitor with `frogbot.auth({ headers })`, reject anonymous requests, and pass a framework-created request containing that user with `overrideAccess: false` when fetching drafts. See the [server-side preview example](https://docs.frogbot.ai/live-preview/server) for the page handler. Render a client refresh component:

```tsx
'use client';

import { RefreshRouteOnSave } from '@frogbotai/live-preview-react';
import { useRouter } from 'next/navigation';

export function LivePreviewRefresh() {
  const router = useRouter();
  const serverURL = process.env.NEXT_PUBLIC_FROGBOT_URL;

  if (!serverURL) throw new Error('NEXT_PUBLIC_FROGBOT_URL is required');

  return <RefreshRouteOnSave refresh={() => router.refresh()} serverURL={serverURL} />;
}
```

For client-side document updates, use `useLivePreview` from `@frogbotai/live-preview-react`:

```tsx
'use client';

import { useLivePreview } from '@frogbotai/live-preview-react';

export function PagePreview({ initialData }: { initialData: { title: string } }) {
  const serverURL = process.env.NEXT_PUBLIC_FROGBOT_URL;

  if (!serverURL) throw new Error('NEXT_PUBLIC_FROGBOT_URL is required');

  const { data } = useLivePreview({
    initialData,
    serverURL,
  });

  return <h1>{data.title}</h1>;
}
```

The preview URL must render one of these integrations; otherwise the iframe loads but does not update.

## Localization

Configure locales once, mark individual fields as localized, and pass `locale` to reads:

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  localization: {
    locales: ['en', 'es', 'de'],
    defaultLocale: 'en',
    fallback: true,
  },
  collections: [
    {
      slug: 'posts',
      fields: [{ name: 'title', type: 'text', localized: true }],
    },
  ],
});
```

```ts
const posts = await frogbot.find({
  collection: 'posts',
  overrideAccess: true,
  locale: 'es',
});
```
