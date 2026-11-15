import type { Access, FrogBotRequest, Where } from 'frogbot';
import { toPayloadRequest } from 'frogbot/internal';

type Targets = readonly string[];

async function readableWhere(req: FrogBotRequest, slug: string): Promise<null | Where> {
  const payloadReq = toPayloadRequest(req);
  const collection = payloadReq.payload.collections[slug];

  if (!collection) return null;

  const read = collection.config.access.read;
  const result = read
    ? await read({ req: payloadReq, slug } as Parameters<typeof read>[0])
    : Boolean(req.user);

  if (result === true) return { collection: { equals: slug } };
  if (!result) return null;

  const { docs } = await req.frogbot.find({
    collection: slug,
    depth: 0,
    overrideAccess: false,
    pagination: false,
    req,
    select: {},
  });

  return {
    and: [
      { collection: { equals: slug } },
      { documentId: { in: docs.map((doc) => String(doc.id)) } },
    ],
  };
}

/** Read: signed in, and only comments on records the user may read. */
export function readAccess(targets: Targets): Access {
  return async ({ req }) => {
    if (!req.user) return false;

    const wheres = await Promise.all(targets.map((slug) => readableWhere(req, slug)));
    const or = wheres.filter((where): where is Where => where !== null);

    return or.length ? { or } : false;
  };
}

/** Create: signed in, on a collection with comments, on a record the user may read. */
export function createAccess(targets: Targets): Access {
  return async ({ data, req }) => {
    if (!req.user) return false;
    if (!data) return true;

    const { collection, documentId } = data as { collection?: unknown; documentId?: unknown };

    if (typeof collection !== 'string' || !targets.includes(collection)) return false;
    if (typeof documentId !== 'string' && typeof documentId !== 'number') return false;

    const record = await req.frogbot
      .findByID({
        collection,
        depth: 0,
        disableErrors: true,
        id: documentId,
        overrideAccess: false,
        req,
      })
      .catch(() => null);

    return Boolean(record);
  };
}

/** Update and delete: the comment's author only. */
export function authorAccess(userSlug: string): Access {
  return ({ req }) =>
    req.user?.collection === userSlug ? { author: { equals: req.user.id } } : false;
}
