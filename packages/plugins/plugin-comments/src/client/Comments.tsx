'use client';

import './Comments.css';

import { PanelSection, toast, useConfig } from '@frogbotai/ui/admin';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { type CommentItem, commentsQuery, type CommentsTarget, toCommentItem } from '../shared.js';
import { CommentBox, errorOf } from './CommentBox.js';
import { CommentList } from './CommentList.js';
import { onPosted, pinnedKey, usePinnedBox } from './pinned.js';

/** Props for `Comments`. */
export type CommentsProps = {
  /** Pictures from a custom `admin.avatar` component, rendered on the server, by user id. */
  avatars?: Record<string, ReactNode>;
  /** Pictures for everyone else: Gravatar, or initials. */
  gravatar?: boolean;
  heading?: ReactNode;
  initial: CommentItem[];
  schemaPath: string;
  target: CommentsTarget;
  userId?: number | string;
};

/**
 * A record's comment list and box. Reloads the list after a comment is added, edited or deleted.
 * While a `PinnedCommentBox` for the record shows in the panel footer, it leaves out its own box
 * and reloads when the pinned box posts.
 */
export function Comments({
  avatars,
  gravatar,
  heading,
  initial,
  schemaPath,
  target,
  userId,
}: CommentsProps) {
  const { config } = useConfig();
  const [comments, setComments] = useState(initial);
  const api = `${config.routes.api}/${target.commentsSlug}`;

  const reload = useCallback(async () => {
    const response = await fetch(`${api}?${commentsQuery(target)}`, { credentials: 'include' });

    if (!response.ok) return;

    const { docs } = (await response.json()) as { docs: Parameters<typeof toCommentItem>[0][] };

    setComments(docs.map((doc) => toCommentItem(doc, target.titleField)).reverse());
  }, [api, target]);

  const key = pinnedKey(target);
  const pinned = usePinnedBox(key);

  useEffect(() => onPosted(key, () => void reload()), [key, reload]);

  const remove = async (id: CommentItem['id']) => {
    const response = await fetch(`${api}/${id}`, { credentials: 'include', method: 'DELETE' });

    if (!response.ok) {
      toast.error('The comment could not be deleted.');

      return;
    }

    await reload();
  };

  const edit = async (id: CommentItem['id'], body: unknown) => {
    const response = await fetch(`${api}/${id}`, {
      body: JSON.stringify({ body }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }).catch(() => null);

    if (!response?.ok) {
      toast.error(await errorOf(response, 'The comment could not be saved.'));

      return false;
    }

    await reload();

    return true;
  };

  const content = (
    <>
      <CommentList
        avatars={avatars}
        comments={comments}
        gravatar={gravatar}
        onDelete={(id) => void remove(id)}
        onEdit={edit}
        schemaPath={schemaPath}
        userId={userId}
      />
      {pinned ? null : (
        <CommentBox onPosted={() => void reload()} schemaPath={schemaPath} target={target} />
      )}
    </>
  );

  return heading ? (
    <PanelSection className="fb-comments" heading={heading}>
      {content}
    </PanelSection>
  ) : (
    <section className="fb-comments">{content}</section>
  );
}
