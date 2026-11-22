import type { Payload, Where } from 'payload';
import { commitTransaction, createPayloadRequest, initTransaction, killTransaction } from 'payload';

import { attachRegisteredFrogBot } from '../config/attachFrogBot.js';
import type { FrogBotLocalAPI } from '../localAPI.js';
import { toFrogBotLocalAPI, toPayloadRequest } from '../seams/request.js';
import type { FrogBotRequest } from '../types/request.js';
import type { BulkResult, DeleteManyArgs, DocID } from './config/types.js';

/** The most documents one Payload bulk delete gets, since it puts every id in one `in (…)` list per query. */
export const BULK_DELETE_PAGE_SIZE = 500;

type Delete = FrogBotLocalAPI['delete'];

type PageArgs = DeleteManyArgs<string> & { req: FrogBotRequest };

/**
 * Payload's `delete`, with a where-keyed delete split into pages of matched ids so one call works for any number of matches.
 *
 * Above {@link BULK_DELETE_PAGE_SIZE} matches, the count, the id lookup and every page share one transaction: the caller's
 * when `req` carries one, otherwise one this call begins, commits at the end, and rolls back if anything throws.
 *
 * Limits above {@link BULK_DELETE_PAGE_SIZE} matches:
 * - Each page is its own Payload delete, so `beforeOperation` and `afterOperation` run once per page, each with that page's docs.
 * - Matches are counted on the caller's `where`, before `beforeOperation` runs. When that count fails, as it does for a hook
 *   that rewrites the `where` to a queryable field, the call falls back to one unpaged Payload delete, which works up to
 *   {@link BULK_DELETE_PAGE_SIZE} matches.
 */
export function pagedDelete(payload: Payload): Delete {
  const local = toFrogBotLocalAPI(payload);
  const remove = ((args: Parameters<Delete>[0]) => local.delete(args)) as Delete;
  const removePage = remove as (args: DeleteManyArgs<string>) => Promise<BulkResult<unknown>>;

  return (async (args: Parameters<Delete>[0]) => {
    if ('id' in args) return remove(args);

    const req = args.req ?? attachRegisteredFrogBot(await createPayloadRequest({ payload }));
    const transactionReq = toPayloadRequest(req);
    const ownsTransaction =
      !payload.db.bulkOperationsSingleTransaction && (await initTransaction(transactionReq));

    try {
      const result = await deleteInPages({ ...args, req });
      if (!result) {
        if (ownsTransaction) await killTransaction(transactionReq);

        return remove(args);
      }

      if (ownsTransaction) await commitTransaction(transactionReq);

      return result;
    } catch (error) {
      if (ownsTransaction) await killTransaction(transactionReq);
      throw error;
    }
  }) as Delete;

  async function deleteInPages(args: PageArgs) {
    const lookup = {
      collection: args.collection,
      where: args.where,
      locale: args.locale,
      trash: args.trash,
      overrideAccess: true,
      req: toPayloadRequest(args.req),
    };

    let totalDocs: number;
    try {
      ({ totalDocs } = await payload.count(lookup));
    } catch {
      return undefined;
    }

    if (totalDocs <= BULK_DELETE_PAGE_SIZE) return removePage(args);

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
  }
}
