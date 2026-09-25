# FrogBot Custom Endpoints Reference

Docs: https://docs.frogbot.ai/rest-api/overview and https://docs.frogbot.ai/local-api/server-functions

Custom endpoints add HTTP routes to the root API or a collection. Handlers receive a `FrogBotRequest`, which is a Web `Request` with FrogBot request context, and return a Web `Response`.

## Endpoint Shape

```ts
import type { Endpoint } from 'frogbot';

export const healthEndpoint: Endpoint = {
  path: '/health',
  method: 'get',
  handler: () => Response.json({ status: 'ok' }),
};
```

| Property  | Type                                                                                  | Description                         |
| --------- | ------------------------------------------------------------------------------------- | ----------------------------------- |
| `path`    | `string`                                                                              | Route beginning with `/`.           |
| `method`  | `'connect' \| 'delete' \| 'get' \| 'head' \| 'options' \| 'patch' \| 'post' \| 'put'` | Lowercase HTTP method.              |
| `handler` | `(req: FrogBotRequest) => Response \| Promise<Response>`                              | Web Request/Response handler.       |
| `custom`  | `Record<string, any>`                                                                 | Optional metadata for integrations. |

## Placement

Root endpoints are mounted under the configured API route:

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  collections: [],
  endpoints: [
    {
      path: '/health',
      method: 'get',
      handler: () => Response.json({ status: 'ok' }),
    },
  ],
});
```

With the default API route, this endpoint is available at `GET /api/health`.

Collection endpoints are mounted after the collection slug:

```ts
import type { CollectionConfig } from 'frogbot';

export const Orders: CollectionConfig = {
  slug: 'orders',
  fields: [{ name: 'status', type: 'text' }],
  endpoints: [
    {
      path: '/:id/tracking',
      method: 'get',
      handler: ({ routeParams }) => {
        return Response.json({ orderID: routeParams?.id });
      },
    },
  ],
};
```

This endpoint is available at `GET /api/orders/:id/tracking`.

## Web Request and Response

Use the standard Web API methods and properties for headers, URL parameters, and bodies:

```ts
import type { Endpoint } from 'frogbot';

export const searchEndpoint: Endpoint = {
  path: '/search',
  method: 'post',
  handler: async (req) => {
    if (!req.url || !req.json) {
      return Response.json({ error: 'Invalid search request' }, { status: 400 });
    }

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') ?? 10);

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return Response.json({ error: 'Invalid search request' }, { status: 400 });
    }

    const body: unknown = await req.json();

    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      ('query' in body && typeof body.query !== 'string')
    ) {
      return Response.json({ error: 'Invalid search body' }, { status: 400 });
    }

    const query = 'query' in body && typeof body.query === 'string' ? body.query : undefined;

    const result = await req.frogbot.find({
      collection: 'posts',
      where: query ? { title: { contains: query } } : undefined,
      limit,
      overrideAccess: false,
      req,
      user: req.user,
    });

    return Response.json(result);
  },
};
```

Use `req.text()` when a webhook signature must be checked against the unparsed body. Use `req.headers`, `req.method`, `req.url`, and `req.routeParams` directly.

## Authentication

Custom endpoints do not require authentication automatically. Check `req.user` before protected work and return an explicit status:

```ts
import type { Endpoint } from 'frogbot';

export const accountEndpoint: Endpoint = {
  path: '/account',
  method: 'get',
  handler: (req) => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return Response.json({ user: req.user });
  },
};
```

Passing `req` preserves request and transaction context. Passing `user` with `overrideAccess: false` enforces that user's collection access rules.

## Next.js Route

The catch-all App Router route connects Web requests to FrogBot's REST handlers:

```ts
import config from '@frogbot-config';
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@frogbotai/next/routes';

export const GET = REST_GET(config);
export const POST = REST_POST(config);
export const DELETE = REST_DELETE(config);
export const PATCH = REST_PATCH(config);
export const PUT = REST_PUT(config);
export const OPTIONS = REST_OPTIONS(config);
```

Place it at `src/app/(frogbot)/api/[...slug]/route.ts` when using the standard FrogBot application layout.

## Practical Rules

1. Validate path parameters, query parameters, and request bodies before database operations.
2. Authenticate explicitly and use `overrideAccess: false` for user-scoped operations.
3. Return Web `Response` objects, using `Response.json()` for JSON.
4. Keep webhook signature verification on the raw body returned by `req.text()`.
5. Avoid endpoint paths reserved by FrogBot's built-in APIs.
