import type { Payload, Where } from 'payload';

import type { FrogBotLocalAPI } from '../localAPI.js';
import { toPayloadRequest } from '../seams/request.js';
import type { BulkResult, DeleteManyArgs, DocID } from './config/types.js';

/** The most documents one Payload bulk delete gets, since it puts every id in one `in (…)` list per query. */
export const BULK_DELETE_PAGE_SIZE = 500;

type Delete = FrogBotLocalAPI['delete'];

/** Splits a where-keyed delete into pages of matched ids, so one call works for any number of matches. */
export function pageBulkDelete(payload: Payload, remove: Delete): Delete {
  const removePage = remove as (args: DeleteManyArgs<string>) => Promise<BulkResult<unknown>>;

  return (async (args: Parameters<Delete>[0]) => {
    if ('id' in args) return remove(args);

    const lookup = {
      collection: args.collection,
      where: args.where,
      locale: args.locale,
      trash: args.trash,
      overrideAccess: true,
      req: args.req && toPayloadRequest(args.req),
    };

    const { totalDocs } = await payload.count(lookup);

    if (totalDocs <= BULK_DELETE_PAGE_SIZE) return remove(args);

    const { docs: matched } = await payload.find({
      ...lookup,
      depth: 0,
      pagination: false,
      select: {},
    });

    const ids: DocID[] = matched.map(({ id }) => id);

    const result: BulkResult<unknown> = { docs: [], errors: [] };

    for (let start = 0; start < ids.length; start += BULK_DELETE_PAGE_SIZE) {
      const page: Where = { id: { in: ids.slice(start, start + BULK_DELETE_PAGE_SIZE) } };
      const { docs, errors } = await removePage({ ...args, where: { and: [args.where, page] } });

      result.docs.push(...docs);
      result.errors.push(...errors);
    }

    return result;
  }) as Delete;
}
