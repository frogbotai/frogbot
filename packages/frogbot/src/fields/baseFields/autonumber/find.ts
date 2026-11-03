import type { FindByIDArgs } from '../../../collections/config/types.js';
import type { FrogBot } from '../../../frogbot.js';
import { toPayloadRequest } from '../../../seams/request.js';
import type { CollectionSlug, TypedCollection } from '../../../types/generated.js';
import { AUTONUMBER_KEYS_SLUG } from './collection.js';

export type FindByAutonumberKeyArgs<T extends CollectionSlug> = Omit<FindByIDArgs<T>, 'id'> & {
  /** A key such as `APP-123`, current or held before a move or a prefix rename. */
  key: string;
};

/**
 * Finds the record holding an `autonumberKeyField` key now, else the record that
 * held it last, else `null`. Takes `findByID`'s options, access included.
 */
export async function findByAutonumberKey<T extends CollectionSlug>(
  frogbot: FrogBot,
  { collection, key, ...options }: FindByAutonumberKeyArgs<T>,
): Promise<TypedCollection<T> | null> {
  const paths = frogbot.config._internal.autonumberKeys
    .filter((entry) => entry.collection === collection)
    .map(({ path }) => path);

  if (!paths.length) {
    throw new Error(`[frogbot] Collection '${collection}' has no autonumberKeyField.`);
  }

  const withReq = options.req ? { req: toPayloadRequest(options.req) } : {};

  const { docs: holders } = await frogbot.db.find({
    collection,
    where: { or: paths.map((path) => ({ [path]: { equals: key } })) },
    limit: 1,
    pagination: false,
    ...withReq,
  });

  let id = (holders[0] as { id?: number | string } | undefined)?.id;

  if (id === undefined) {
    const { docs: held } = await frogbot.db.find({
      collection: AUTONUMBER_KEYS_SLUG,
      where: { and: [{ collection: { equals: collection } }, { key: { equals: key } }] },
      sort: ['-createdAt', '-id'],
      limit: 1,
      pagination: false,
      ...withReq,
    });

    const record = (held[0] as { record?: string } | undefined)?.record;

    if (record === undefined) return null;

    const config = frogbot.db.payload.collections[collection];
    const idType = config?.customIDType ?? frogbot.db.defaultIDType;

    id = idType === 'number' ? Number(record) : record;
  }

  const doc = await frogbot.findByID({ ...options, collection, id, disableErrors: true });

  return doc ?? null;
}
