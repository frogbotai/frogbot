import { PinnedCommentBox } from '../client/PinnedCommentBox.js';
import { type CommentsRequest, commentsTarget } from './target.js';

/** The server props the record panel gives a `footer` component that `CommentBoxFooter` reads. */
export type CommentBoxFooterProps = {
  collectionSlug?: string;
  id?: number | string;
  req?: CommentsRequest;
};

/**
 * The record's comment box, for `admin.components.panel.footer`, pinned under the panel's
 * scrolling body. `commentsField()` in that panel then shows only the list. Renders nothing on a
 * create form or for a collection without comments.
 */
export async function CommentBoxFooter({ collectionSlug, id, req }: CommentBoxFooterProps) {
  if (!req || !collectionSlug || id === undefined || id === null || id === '') return null;

  const found = await commentsTarget({ collection: collectionSlug, id, req });

  if (!found) return null;

  return <PinnedCommentBox schemaPath={found.schemaPath} target={found.target} />;
}
