import type { CollectionConfig, Endpoint } from 'frogbot';
import { buildConfig } from 'frogbot';

import { createCoreConfig } from './core-context.js';

export const healthEndpoint: Endpoint = {
  path: '/health',
  method: 'get',
  handler: () => Response.json({ status: 'ok' }),
};

export const rootConfig = buildConfig({
  ...createCoreConfig(),
  endpoints: [
    {
      path: '/health',
      method: 'get',
      handler: () => Response.json({ status: 'ok' }),
    },
  ],
});

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
