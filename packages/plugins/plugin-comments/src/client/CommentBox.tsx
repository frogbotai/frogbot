'use client';

import { toast, useConfig } from '@frogbotai/ui/admin';

import type { CommentsTarget } from '../shared.js';
import { CommentEditor } from './CommentEditor.js';

/** Props for `CommentBox`. */
export type CommentBoxProps = {
  /** Called after a comment is saved. */
  onPosted?: () => void;
  /** The comments collection's body field for this record's collection, `collection.comments.body_0`. */
  schemaPath: string;
  target: CommentsTarget;
};

/** The error message in a failed comments API response, or `fallback`. */
export async function errorOf(response: Response | null, fallback: string): Promise<string> {
  const result = (await response?.json().catch(() => null)) as {
    errors?: { message?: string }[];
  } | null;

  return result?.errors?.[0]?.message ?? fallback;
}

/** A rich text box that adds a comment to a record through the comments API. */
export function CommentBox({ onPosted, schemaPath, target }: CommentBoxProps) {
  const { config } = useConfig();

  const post = async (body: unknown) => {
    const response = await fetch(`${config.routes.api}/${target.commentsSlug}`, {
      body: JSON.stringify({
        body,
        collection: target.collection,
        documentId: String(target.documentId),
      }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }).catch(() => null);

    if (!response?.ok) {
      toast.error(await errorOf(response, 'The comment could not be saved.'));

      return false;
    }

    onPosted?.();

    return true;
  };

  return (
    <div className="fb-comments__box">
      <CommentEditor compact onSubmit={post} schemaPath={schemaPath} submitLabel="Comment" />
    </div>
  );
}
