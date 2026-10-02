import type { Endpoint } from '../endpoints/types.js';
import type { CollectionSlug } from '../types/generated.js';
import { SearchValidationError } from './errors.js';
import type { SearchManyOptions, SearchOptions } from './types.js';

type SearchBody = Omit<SearchOptions, 'collection' | 'overrideAccess' | 'req'>;

type SearchManyBody = Omit<SearchManyOptions, 'overrideAccess' | 'req'>;

const searchBodyKeys = new Set<string>([
  'candidates',
  'depth',
  'draft',
  'fallbackLocale',
  'index',
  'limit',
  'locale',
  'query',
  'select',
  'where',
] satisfies (keyof SearchBody)[]);

const searchManyBodyKeys = new Set<string>([
  'collections',
  'draft',
  'fallbackLocale',
  'limit',
  'locale',
  'query',
] satisfies (keyof SearchManyBody)[]);

async function readBody<T>(
  json: (() => Promise<unknown>) | undefined,
  keys: ReadonlySet<string>,
): Promise<T> {
  let body: unknown;

  try {
    body = await json?.();
  } catch {
    throw new SearchValidationError('Search requires a JSON request body.');
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new SearchValidationError('Search requires a JSON object request body.');
  }

  for (const key of Object.keys(body)) {
    if (!keys.has(key)) {
      throw new SearchValidationError(`Search does not support the '${key}' option.`);
    }
  }

  return body as T;
}

export function buildSearchEndpoints({ collection }: { collection: string }): Endpoint[] {
  return [
    {
      method: 'post',
      path: '/search',
      handler: async (req) => {
        const body = await readBody<SearchBody>(req.json?.bind(req), searchBodyKeys);

        const result = await req.frogbot.search({
          ...body,
          collection: collection as CollectionSlug,
          overrideAccess: false,
          req,
        });

        return Response.json(result);
      },
    },
  ];
}

export function buildSearchManyEndpoint(): Endpoint {
  return {
    method: 'post',
    path: '/frogbot/search',
    handler: async (req) => {
      const body = await readBody<SearchManyBody>(req.json?.bind(req), searchManyBodyKeys);

      const result = await req.frogbot.searchMany({ ...body, overrideAccess: false, req });

      return Response.json(result);
    },
  };
}
