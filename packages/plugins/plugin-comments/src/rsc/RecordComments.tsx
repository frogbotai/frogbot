import type { ReactNode } from 'react';

import { Comments } from '../client/Comments.js';
import { commentsCustomKey } from '../fields/comments.js';
import { COMMENTS_LIMIT, toCommentItem } from '../shared.js';
import type { CommentsConfig } from '../types.js';

type Doc = Record<string, unknown> & { id: number | string };

type AvatarSetting = 'default' | 'gravatar' | { Component: unknown } | undefined;

type CommentsPayload = {
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

/** What `RecordComments` needs: the request, and the record to show comments for. */
export type RecordCommentsProps = {
  collection: string;
  /** The heading above the list. Omit it for none, for example inside a tab of the same name. */
  heading?: ReactNode;
  id: number | string;
  /**
   * Renders a custom `admin.avatar` component for each author. Without it, the component is
   * looked up in the import map and rendered with `user` and `size`.
   */
  renderComponent?: (args: {
    Component: unknown;
    importMap: unknown;
    key?: string;
    serverProps?: object;
  }) => ReactNode;
  req: {
    payload: CommentsPayload;
    user?: ({ id: number | string } & Record<string, unknown>) | null;
  };
};

type AvatarComponent = (props: { size: number; user: Doc }) => ReactNode;

function resolveComponent(component: unknown, importMap: unknown): AvatarComponent | undefined {
  const path =
    typeof component === 'string' ? component : (component as { path?: string } | null)?.path;

  return path ? (importMap as Record<string, AvatarComponent> | undefined)?.[path] : undefined;
}

function customAvatars(
  payload: CommentsPayload,
  users: (Doc | undefined)[],
  render: RecordCommentsProps['renderComponent'],
): Record<string, ReactNode> | undefined {
  const setting = payload.config.admin?.avatar;

  if (!setting || typeof setting !== 'object') return undefined;

  const Component = resolveComponent(setting.Component, payload.importMap);

  if (!render && !Component) return undefined;

  const byId = new Map(
    users.filter((user): user is Doc => Boolean(user)).map((user) => [String(user.id), user]),
  );

  return Object.fromEntries(
    [...byId].map(([id, user]) => [
      id,
      render
        ? render({
            Component: setting.Component,
            importMap: payload.importMap,
            key: id,
            serverProps: { size: 24, user },
          })
        : Component && <Component key={id} size={24} user={user} />,
    ]),
  );
}

/**
 * A record's comments, oldest first, with a box to add one, read with the signed-in user's
 * access, skipping any older than the record. Renders nothing when the user can't read the record or its collection has no comments.
 * Use it in a custom view or dashboard; `commentsField()` renders it in a record's form.
 */
export async function RecordComments({
  collection,
  heading,
  id,
  renderComponent,
  req,
}: RecordCommentsProps) {
  const { payload, user } = req;
  const options = payload.config.custom?.[commentsCustomKey] as CommentsConfig | undefined;
  const bodyField = options?.bodies[collection];

  if (!user || !options || !bodyField) return null;

  const record = await payload
    .findByID({ collection, depth: 0, disableErrors: true, id, overrideAccess: false, req })
    .catch(() => null);

  if (!record) return null;

  const since = typeof record.createdAt === 'string' ? record.createdAt : undefined;

  const { docs } = await payload
    .find({
      collection: options.commentsSlug,
      depth: 1,
      limit: COMMENTS_LIMIT,
      overrideAccess: false,
      req,
      sort: '-createdAt',
      where: {
        and: [
          { collection: { equals: collection } },
          { documentId: { equals: String(id) } },
          ...(since ? [{ createdAt: { greater_than_equal: since } }] : []),
        ],
      },
    })
    .catch(() => ({ docs: [] as Doc[] }));

  const titleField = payload.collections[options.userSlug]?.config.admin?.useAsTitle;
  const authors = docs.map((doc) =>
    doc.author && typeof doc.author === 'object' ? (doc.author as Doc) : undefined,
  );

  return (
    <Comments
      avatars={customAvatars(payload, [...authors, user], renderComponent)}
      gravatar={(payload.config.admin?.avatar ?? 'gravatar') === 'gravatar'}
      heading={heading}
      initial={docs.map((doc) => toCommentItem(doc, titleField)).reverse()}
      schemaPath={`collection.${options.commentsSlug}.${bodyField}`}
      target={{ collection, commentsSlug: options.commentsSlug, documentId: id, since, titleField }}
      userId={user.id}
    />
  );
}
