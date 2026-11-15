'use client';

import {
  type JSXConvertersFunction,
  MentionJSXConverter,
  RichText,
} from '@frogbotai/richtext-lexical/react';
import type { ComponentProps } from 'react';

import type { CommentItem } from '../shared.js';

type Data = ComponentProps<typeof RichText>['data'];

/** Props for `CommentList`. */
export type CommentListProps = {
  comments: CommentItem[];
  /** Called with a comment's id when its author deletes it. Omit it to hide delete. */
  onDelete?: (id: CommentItem['id']) => void;
  /** The signed-in user's id, so their own comments can be deleted. */
  userId?: number | string;
};

const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  ...MentionJSXConverter,
});

const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Comments, oldest first: who wrote each one, when, and its rich text with mentions as `@Name`. */
export function CommentList({ comments, onDelete, userId }: CommentListProps) {
  if (!comments.length) return <p className="fb-comments__empty">No comments yet.</p>;

  return (
    <ol className="fb-comments__list">
      {comments.map((comment) => (
        <li className="fb-comments__item" key={comment.id}>
          <div className="fb-comments__meta">
            <strong>{comment.authorName}</strong>
            <time dateTime={comment.createdAt} suppressHydrationWarning>
              {time.format(new Date(comment.createdAt))}
            </time>
            {onDelete && userId !== undefined && String(comment.authorId) === String(userId) ? (
              <button
                className="fb-comments__delete"
                onClick={() => onDelete(comment.id)}
                type="button"
              >
                Delete
              </button>
            ) : null}
          </div>
          <RichText
            className="fb-comments__body"
            converters={converters}
            data={comment.body as Data}
          />
        </li>
      ))}
    </ol>
  );
}
