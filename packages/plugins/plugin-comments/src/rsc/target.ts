import { commentsCustomKey } from '../fields/comments.js';
import type { CommentsTarget } from '../shared.js';
import type { CommentsConfig } from '../types.js';

export type Doc = Record<string, unknown> & { id: number | string };

export type AvatarSetting = 'default' | 'gravatar' | { Component: unknown } | undefined;

/** The parts of the Payload instance the comments components read. */
export type CommentsPayload = {
  collections: Record<string, { config: { admin?: { useAsTitle?: string } } } | undefined>;
  config: { admin?: { avatar?: AvatarSetting }; custom?: Record<string, unknown> };
  importMap?: unknown;
  find: (args: {
    collection: string;
    depth: number;
    limit: number;
    overrideAccess: false;
    req: unknown;
    sort: string;
    where: Record<string, unknown>;
  }) => Promise<{ docs: Doc[] }>;
  findByID: (args: {
    collection: string;
    depth: number;
    disableErrors: true;
    id: number | string;
    overrideAccess: false;
    req: unknown;
  }) => Promise<Doc | null>;
};

/** The request the comments components read with: the Payload instance and the signed-in user. */
export type CommentsRequest = {
  payload: CommentsPayload;
  user?: ({ id: number | string } & Record<string, unknown>) | null;
};

/**
 * Where a record's comments live, read with the signed-in user's access: the plugin's config,
 * the comments target and the body field's schema path. `null` when there's no user, the
 * collection has no comments, or the user can't read the record.
 */
export async function commentsTarget({
  collection,
  id,
  req,
}: {
  collection: string;
  id: number | string;
  req: CommentsRequest;
}): Promise<{ options: CommentsConfig; schemaPath: string; target: CommentsTarget } | null> {
  const { payload, user } = req;
  const options = payload.config.custom?.[commentsCustomKey] as CommentsConfig | undefined;
  const bodyField = options?.bodies[collection];

  if (!user || !options || !bodyField) return null;

  const record = await payload
    .findByID({ collection, depth: 0, disableErrors: true, id, overrideAccess: false, req })
    .catch(() => null);

  if (!record) return null;

  const since = typeof record.createdAt === 'string' ? record.createdAt : undefined;
  const titleField = payload.collections[options.userSlug]?.config.admin?.useAsTitle;

  return {
    options,
    schemaPath: `collection.${options.commentsSlug}.${bodyField}`,
    target: { collection, commentsSlug: options.commentsSlug, documentId: id, since, titleField },
  };
}
