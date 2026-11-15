import type { ReactNode } from 'react';

import { Comments } from '../client/Comments.js';
import { commentsCustomKey } from '../fields/comments.js';
import { COMMENTS_LIMIT, toCommentItem } from '../shared.js';
import type { CommentsConfig } from '../types.js';

type Doc = Record<string, unknown> & { id: number | string };

type CommentsPayload = {
  collections: Record<string, { config: { admin?: { useAsTitle?: string } } } | undefined>;
  config: { custom?: Record<string, unknown> };
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

/** What `RecordComments` needs: the request, and the record to show comments for. */
export type RecordCommentsProps = {
  collection: string;
  /** The heading above the list. Omit it for none, for example inside a tab of the same name. */
  heading?: ReactNode;
  id: number | string;
  req: { payload: CommentsPayload; user?: { id: number | string } | null };
};

/**
 * A record's comments, oldest first, with a box to add one, read with the signed-in user's
 * access. Renders nothing when the user can't read the record or its collection has no comments.
 * Use it in a custom view or dashboard; `commentsField()` renders it in a record's form.
 */
export async function RecordComments({ collection, heading, id, req }: RecordCommentsProps) {
  const { payload, user } = req;
  const options = payload.config.custom?.[commentsCustomKey] as CommentsConfig | undefined;
  const bodyField = options?.bodies[collection];

  if (!user || !options || !bodyField) return null;

  const record = await payload
    .findByID({ collection, depth: 0, disableErrors: true, id, overrideAccess: false, req })
    .catch(() => null);

  if (!record) return null;

  const { docs } = await payload
    .find({
      collection: options.commentsSlug,
      depth: 1,
      limit: COMMENTS_LIMIT,
      overrideAccess: false,
      req,
      sort: '-createdAt',
      where: {
        and: [{ collection: { equals: collection } }, { documentId: { equals: String(id) } }],
      },
    })
    .catch(() => ({ docs: [] as Doc[] }));

  const titleField = payload.collections[options.userSlug]?.config.admin?.useAsTitle;

  return (
    <Comments
      heading={heading}
      initial={docs.map((doc) => toCommentItem(doc, titleField)).reverse()}
      schemaPath={`collection.${options.commentsSlug}.${bodyField}`}
      target={{ collection, commentsSlug: options.commentsSlug, documentId: id, titleField }}
      userId={user.id}
    />
  );
}
