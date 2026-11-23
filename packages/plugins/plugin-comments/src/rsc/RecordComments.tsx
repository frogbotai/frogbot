import type { ReactNode } from 'react';

import { Comments } from '../client/Comments.js';
import { COMMENTS_LIMIT, toCommentItem } from '../shared.js';
import { type CommentsPayload, type CommentsRequest, commentsTarget, type Doc } from './target.js';

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
  req: CommentsRequest;
};

type AvatarComponent = (props: { size: number; user: Doc }) => ReactNode;

function importMapKey(component: unknown): string | undefined {
  const { exportName, path } =
    typeof component === 'string'
      ? { exportName: undefined, path: component }
      : ((component ?? {}) as { exportName?: string; path?: string });

  if (!path) return undefined;

  const [file, named] = path.split('#');

  return `${file}#${exportName ?? named ?? 'default'}`;
}

function resolveComponent(component: unknown, importMap: unknown): AvatarComponent | undefined {
  const key = importMapKey(component);

  return key ? (importMap as Record<string, AvatarComponent> | undefined)?.[key] : undefined;
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
  const found = await commentsTarget({ collection, id, req });
  const { payload, user } = req;

  if (!found || !user) return null;

  const { options, schemaPath, target } = found;

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
          ...(target.since ? [{ createdAt: { greater_than_equal: target.since } }] : []),
        ],
      },
    })
    .catch(() => ({ docs: [] as Doc[] }));

  const authors = docs.map((doc) =>
    doc.author && typeof doc.author === 'object' ? (doc.author as Doc) : undefined,
  );

  return (
    <Comments
      avatars={customAvatars(payload, [...authors, user], renderComponent)}
      gravatar={(payload.config.admin?.avatar ?? 'gravatar') === 'gravatar'}
      heading={heading}
      initial={docs.map((doc) => toCommentItem(doc, target.titleField)).reverse()}
      schemaPath={schemaPath}
      target={target}
      userId={user.id}
    />
  );
}
