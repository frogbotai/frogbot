'use client';

import './Comments.css';

import { PanelSection, toast, useConfig } from '@frogbotai/ui/admin';
import { type ReactNode, useCallback, useState } from 'react';

import { type CommentItem, commentsQuery, type CommentsTarget, toCommentItem } from '../shared.js';
import { CommentBox } from './CommentBox.js';
import { CommentList } from './CommentList.js';

/** Props for `Comments`. */
export type CommentsProps = {
  heading?: ReactNode;
  initial: CommentItem[];
  schemaPath: string;
  target: CommentsTarget;
  userId?: number | string;
};

/** A record's comment list and box. Reloads the list after a comment is added or deleted. */
export function Comments({ heading, initial, schemaPath, target, userId }: CommentsProps) {
  const { config } = useConfig();
  const [comments, setComments] = useState(initial);
  const api = `${config.routes.api}/${target.commentsSlug}`;

  const reload = useCallback(async () => {
    const response = await fetch(`${api}?${commentsQuery(target)}`, { credentials: 'include' });

    if (!response.ok) return;

    const { docs } = (await response.json()) as { docs: Parameters<typeof toCommentItem>[0][] };

    setComments(docs.map((doc) => toCommentItem(doc, target.titleField)).reverse());
  }, [api, target]);

  const remove = async (id: CommentItem['id']) => {
    const response = await fetch(`${api}/${id}`, { credentials: 'include', method: 'DELETE' });

    if (!response.ok) {
      toast.error('The comment could not be deleted.');

      return;
    }

    await reload();
  };

  const content = (
    <>
      <CommentList comments={comments} onDelete={(id) => void remove(id)} userId={userId} />
      <CommentBox onPosted={() => void reload()} schemaPath={schemaPath} target={target} />
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
