'use client';

import './Comments.css';

import { useLayoutEffect } from 'react';

import type { CommentsTarget } from '../shared.js';
import { CommentBox } from './CommentBox.js';
import { announcePosted, pinnedKey, registerPinned } from './pinned.js';

/** Props for `PinnedCommentBox`. */
export type PinnedCommentBoxProps = {
  schemaPath: string;
  target: CommentsTarget;
};

/**
 * The comment box pinned in the record panel's footer. While it shows, the record's comment list
 * leaves out its own box, and each post reloads the list.
 */
export function PinnedCommentBox({ schemaPath, target }: PinnedCommentBoxProps) {
  const key = pinnedKey(target);

  useLayoutEffect(() => registerPinned(key), [key]);

  return (
    <div className="fb-comments fb-comments--pinned">
      <CommentBox onPosted={() => announcePosted(key)} schemaPath={schemaPath} target={target} />
    </div>
  );
}
