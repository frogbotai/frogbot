# FrogBot Querying Reference

Docs: https://docs.frogbot.ai/queries/overview, https://docs.frogbot.ai/queries/depth, https://docs.frogbot.ai/queries/pagination, https://docs.frogbot.ai/queries/select, and https://docs.frogbot.ai/queries/sort

Use the Local API on a `Frogbot` instance for server-side operations, or the REST API over HTTP. A standard FrogBot application does not mount a GraphQL execution endpoint.

## Query Operators

```ts
import type { Where } from 'frogbot';

const query: Where = {
  and: [
    { status: { equals: 'published' } },
    {
      or: [{ title: { contains: 'release' } }, { category: { in: ['news', 'updates'] } }],
    },
    { publishedAt: { less_than_equal: new Date().toISOString() } },
  ],
};
```

Common operators include `equals`, `not_equals`, `greater_than`, `greater_than_equal`, `less_than`, `less_than_equal`, `contains`, `like`, `in`, `not_in`, `exists`, and `near`. Query nested properties with dot notation:

```ts
const query: Where = {
  'author.role': { equals: 'editor' },
  'meta.featured': { exists: true },
};
```

## Local API

```ts
import config from '@/frogbot.config';
import { getFrogbot } from 'frogbot';

const frogbot = await getFrogbot({ config });

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
```

### Select Option

`select` is an operation option typed as `SelectType`. It accepts inclusion or exclusion maps, including nested maps. It does not narrow the operation's TypeScript return type.

Runtime projections can omit fields even though the return type still describes the full document. Selection keys are not checked against your generated collection fields. Do not infer projection support for `count` or distinct-value operations from shared argument types.

Do not pass `select` to `restoreVersion`. Its argument type excludes selection because a projected restore can save an incomplete version snapshot or fail when an omitted field is required. Restore without selection, then pick the response fields you need. This restriction is type-level only; JavaScript callers must also omit the option.

```ts
import type { SelectType } from 'frogbot';

const select = {
  title: true,
  author: true,
  meta: { featured: true },
} satisfies SelectType;

const posts = await frogbot.find({
  collection: 'posts',
  select,
});
```

Use either an inclusion map or an exclusion map for one operation:

```ts
const select = {
  internalNotes: false,
  meta: { privateLabel: false },
} satisfies SelectType;
```

### Access Control

Local API operations bypass access control by default. To run an operation as a user, pass the user and set `overrideAccess: false`:

```ts
const posts = await frogbot.find({
  collection: 'posts',
  user: currentUser,
  overrideAccess: false,
});
```

When starting a nested operation from a hook or endpoint, pass its `req` so it shares the request and transaction context:

```ts
await req.frogbot.create({
  collection: 'audit-events',
  data: { action: 'post-created', document: doc.id },
  req,
});
```

## REST API

Collection routes use the configured API route, `/api` by default:

```text
GET    /api/{collection}
GET    /api/{collection}/{id}
POST   /api/{collection}
PATCH  /api/{collection}/{id}
DELETE /api/{collection}/{id}
GET    /api/{collection}/count
```

Encode `where`, pagination, depth, sorting, and selection options as query parameters. For simple filters:

```ts
const params = new URLSearchParams({
  'where[status][equals]': 'published',
  limit: '10',
  sort: '-createdAt',
});

const response = await fetch(`/api/posts?${params}`);
const result = await response.json();
```

## GraphQL

The following illustrates a query for an application that separately supplies and verifies a compatible GraphQL execution integration. It is not executable against a standard FrogBot installation.

```graphql
query PublishedPosts {
  Posts(where: { status: { equals: published } }, limit: 10, sort: "-createdAt") {
    docs {
      id
      title
    }
    totalDocs
  }
}
```

Prefer `depth` and `select` deliberately, index fields used frequently in `where` and `sort`, and avoid unbounded `limit` values.
