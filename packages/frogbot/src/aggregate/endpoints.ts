import type { Endpoint } from '../endpoints/types.js';
import { AggregateValidationError } from './errors.js';
import type { AggregateOptions } from './types.js';

type AggregateBody = Omit<AggregateOptions, 'collection' | 'context' | 'overrideAccess' | 'req'>;

const aggregateBodyKeys = new Set<string>([
  'depth',
  'disableErrors',
  'draft',
  'fallbackLocale',
  'groupBy',
  'limit',
  'locale',
  'page',
  'populate',
  'sort',
  'trash',
  'values',
  'where',
] satisfies (keyof AggregateBody)[]);

async function readBody(json: (() => Promise<unknown>) | undefined): Promise<AggregateBody> {
  let body: unknown;

  try {
    body = await json?.();
  } catch {
    throw new AggregateValidationError('Aggregate requires a JSON request body.');
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AggregateValidationError('Aggregate requires a JSON object request body.');
  }

  for (const key of Object.keys(body)) {
    if (!aggregateBodyKeys.has(key)) {
      throw new AggregateValidationError(`Aggregate does not support the '${key}' option.`);
    }
  }

  return body as AggregateBody;
}

/** `POST /api/<collection>/aggregate`, always as the signed-in user. */
export function buildAggregateEndpoints({ collection }: { collection: string }): Endpoint[] {
  return [
    {
      method: 'post',
      path: '/aggregate',
      handler: async (req) => {
        const body = await readBody(req.json?.bind(req));

        const result = await req.frogbot.aggregate({
          ...body,
          collection,
          overrideAccess: false,
          req,
        });

        return Response.json(result);
      },
    },
  ];
}
