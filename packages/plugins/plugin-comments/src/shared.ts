/** A comment as the list shows it. */
export type CommentItem = {
  authorId?: number | string;
  authorName: string;
  body: unknown;
  createdAt: string;
  id: number | string;
};

/** Where a record's comments live and how to load and add them. */
export type CommentsTarget = {
  /** The record's collection. */
  collection: string;
  /** The comments collection's slug. */
  commentsSlug: string;
  /** The record's id. */
  documentId: number | string;
  /** The field that names a user, such as `name`. */
  titleField?: string;
};

type Doc = Record<string, unknown> & { id: number | string };

/** How many of the latest comments the list shows. */
export const COMMENTS_LIMIT = 50;

function authorName(author: unknown, titleField: string | undefined): string {
  if (!author || typeof author !== 'object') return 'Someone';

  const doc = author as Doc;

  for (const value of [titleField && doc[titleField], doc.email]) {
    if (typeof value === 'string' && value) return value;
  }

  return `#${doc.id}`;
}

/** Turns a comment read at depth 1 into what the list shows. */
export function toCommentItem(doc: Doc, titleField: string | undefined): CommentItem {
  const author = doc.author;

  return {
    authorId:
      author && typeof author === 'object'
        ? (author as Doc).id
        : (author as number | string | undefined),
    authorName: authorName(author, titleField),
    body: doc.body,
    createdAt: String(doc.createdAt),
    id: doc.id,
  };
}

/** The REST query for a record's latest comments, newest first. */
export function commentsQuery({ collection, documentId }: CommentsTarget): string {
  return new URLSearchParams({
    depth: '1',
    limit: String(COMMENTS_LIMIT),
    sort: '-createdAt',
    'where[collection][equals]': collection,
    'where[documentId][equals]': String(documentId),
  }).toString();
}
