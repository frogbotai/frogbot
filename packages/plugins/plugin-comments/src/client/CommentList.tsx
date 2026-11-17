'use client';

import {
  type JSXConvertersFunction,
  MentionJSXConverter,
  RichText,
} from '@frogbotai/richtext-lexical/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  UserAvatar,
} from '@frogbotai/ui';
import { MoreHorizontalIcon } from '@frogbotai/ui/icons';
import { type ComponentProps, type ReactNode, useState } from 'react';

import { type CommentItem, formatWhen } from '../shared.js';
import { CommentEditor } from './CommentEditor.js';

type Data = ComponentProps<typeof RichText>['data'];

/** Props for `CommentList`. */
export type CommentListProps = {
  /** Pictures from a custom `admin.avatar` component, rendered on the server, by author id. */
  avatars?: Record<string, ReactNode>;
  comments: CommentItem[];
  /** Pictures for authors without one in `avatars`: Gravatar, or initials. */
  gravatar?: boolean;
  /** Called when the author deletes their comment. Omit it to hide Delete. */
  onDelete?: (id: CommentItem['id']) => void;
  /** Saves the author's edit; resolves `true` when saved. Omit it to hide Edit. */
  onEdit?: (id: CommentItem['id'], body: unknown) => Promise<boolean>;
  /** The body field to edit in, `collection.comments.body_0`. Needed for Edit. */
  schemaPath?: string;
  /** The signed-in user's id: only their own comments can be edited or deleted. */
  userId?: number | string;
};

const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  ...MentionJSXConverter,
});

const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

type RowProps = Omit<CommentListProps, 'comments'> & { comment: CommentItem };

function CommentRow({
  avatars,
  comment,
  gravatar,
  onDelete,
  onEdit,
  schemaPath,
  userId,
}: RowProps) {
  const [editing, setEditing] = useState(false);
  const own = userId !== undefined && String(comment.authorId) === String(userId);
  const avatar = avatars?.[String(comment.authorId)] ?? (
    <UserAvatar
      email={comment.authorEmail}
      gravatar={gravatar}
      name={comment.authorName}
      size={24}
    />
  );

  return (
    <li className="fb-comments__item">
      <span className="fb-comments__avatar">{avatar}</span>
      <div className="fb-comments__main">
        <div className="fb-comments__meta">
          <strong>{comment.authorName}</strong>
          <span aria-hidden>·</span>
          <time
            dateTime={comment.createdAt}
            suppressHydrationWarning
            title={full.format(new Date(comment.createdAt))}
          >
            {formatWhen(comment.createdAt)}
          </time>
          {comment.edited ? <span className="fb-comments__edited">(edited)</span> : null}
          {own && !editing && (onEdit || onDelete) ? (
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Comment options" className="fb-comments__menu">
                <MoreHorizontalIcon aria-hidden size={16} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && schemaPath ? (
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    Edit comment
                  </DropdownMenuItem>
                ) : null}
                {onDelete ? (
                  <DropdownMenuItem
                    className="fb-comments__danger"
                    onSelect={() => onDelete(comment.id)}
                  >
                    Delete comment
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {editing && onEdit && schemaPath ? (
          <CommentEditor
            initial={comment.body}
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              const saved = await onEdit(comment.id, body);

              if (saved) setEditing(false);

              return saved;
            }}
            schemaPath={schemaPath}
            submitLabel="Save"
          />
        ) : (
          <RichText
            className="fb-comments__body"
            converters={converters}
            data={comment.body as Data}
          />
        )}
      </div>
    </li>
  );
}

/**
 * Comments, oldest first: each with the author's picture and name, when it was posted, whether
 * it was edited, and its rich text with mentions. The author can edit or delete their own.
 */
export function CommentList({ comments, ...props }: CommentListProps) {
  if (!comments.length) return <p className="fb-comments__empty">No comments yet.</p>;

  return (
    <ol className="fb-comments__list">
      {comments.map((comment) => (
        <CommentRow comment={comment} key={comment.id} {...props} />
      ))}
    </ol>
  );
}
