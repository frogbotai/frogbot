import type { AccessResult } from '../collections/config/types.js';
import { toPayloadRequest } from '../seams/request.js';
import type { FrogBotRequest } from '../types/request.js';

/** What the Space collection's own `read` or `update` access returns for this request. */
export async function spaceAccess({
  req,
  spacesSlug,
  kind,
}: {
  req: FrogBotRequest;
  spacesSlug: string;
  kind: 'read' | 'update';
}): Promise<AccessResult> {
  const payloadConfig = await req.frogbot.config._internal.payloadConfig;
  const spaces = payloadConfig.collections.find(({ slug }) => slug === spacesSlug);
  const access = spaces?.access[kind];

  if (!access) return Boolean(req.user);

  return access({ req: toPayloadRequest(req), slug: spacesSlug });
}

/** Whether this request can read, or update, the Space with this ID under the Space collection's access. */
export async function canAccessSpace({
  req,
  id,
  kind,
}: {
  req: FrogBotRequest;
  id: number | string;
  kind: 'read' | 'update';
}): Promise<boolean> {
  const chat = req.frogbot.config.chat;

  if (!chat.enabled) return false;

  const access = await spaceAccess({ req, spacesSlug: chat.spacesSlug, kind });

  if (access === false) return false;

  const { totalDocs } = await req.frogbot.count({
    collection: chat.spacesSlug,
    where: access === true ? { id: { equals: id } } : { and: [access, { id: { equals: id } }] },
    req,
    overrideAccess: true,
  });

  return totalDocs > 0;
}
