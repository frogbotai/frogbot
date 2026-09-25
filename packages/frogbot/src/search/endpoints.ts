import type { Endpoint } from '../endpoints/types.js';
import type { CollectionSlug } from '../types/generated.js';
import { SearchValidationError } from './errors.js';
import type { SearchOptions } from './types.js';

type SearchBody = Omit<SearchOptions, 'collection' | 'overrideAccess' | 'req'>;

const bodyKeys = new Set<string>([
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

async function readBody(json: (() => Promise<unknown>) | undefined): Promise<SearchBody> {
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
    if (!bodyKeys.has(key)) {
      throw new SearchValidationError(`Search does not support the '${key}' option.`);
    }
  }

  return body as SearchBody;
}

export function buildSearchEndpoints({ collection }: { collection: string }): Endpoint[] {
  return [
    {
      method: 'post',
      path: '/search',
      handler: async (req) => {
        const body = await readBody(req.json?.bind(req));

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
