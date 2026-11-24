/** A comment as the list shows it. */
export type CommentItem = {
  authorEmail?: string;
  authorId?: number | string;
  /** The author's display name: their title field, or the part of their email before the @. */
  authorName: string;
  body: unknown;
  createdAt: string;
  /** Whether the comment was changed after it was posted. */
  edited: boolean;
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
  /** The record's `createdAt`. Older comments belong to a deleted record whose id was reused. */
  since?: string;
  /** The field that names a user, such as `name`. */
  titleField?: string;
};

type Doc = Record<string, unknown> & { id: number | string };

/** How many of the latest comments the list shows. */
export const COMMENTS_LIMIT = 50;

const EMAIL = /^\S+@\S+$/;

function authorName(author: unknown, titleField: string | undefined): string {
  if (!author || typeof author !== 'object') return 'Someone';

  const doc = author as Doc;
  const name = titleField ? doc[titleField] : undefined;

  if (typeof name === 'string' && name.trim() && !EMAIL.test(name.trim())) return name.trim();

  const email = [doc.email, name].find(
    (value): value is string => typeof value === 'string' && EMAIL.test(value.trim()),
  );

  return email ? email.trim().split('@')[0] : `#${doc.id}`;
}

/** Turns a comment read at depth 1 into what the list shows. */
export function toCommentItem(doc: Doc, titleField: string | undefined): CommentItem {
  const author = doc.author;

  const created = Date.parse(String(doc.createdAt));
  const updated = Date.parse(String(doc.updatedAt));

  return {
    authorEmail:
      author && typeof author === 'object' && typeof (author as Doc).email === 'string'
        ? ((author as Doc).email as string)
        : undefined,
    authorId:
      author && typeof author === 'object'
        ? (author as Doc).id
        : (author as number | string | undefined),
    authorName: authorName(author, titleField),
    body: doc.body,
    createdAt: String(doc.createdAt),
    edited: updated - created > 1000,
    id: doc.id,
  };
}

/** The REST query for a record's latest comments, newest first. */
export function commentsQuery({ collection, documentId, since }: CommentsTarget): string {
  return new URLSearchParams({
    depth: '1',
    limit: String(COMMENTS_LIMIT),
    sort: '-createdAt',
    'where[collection][equals]': collection,
    'where[documentId][equals]': String(documentId),
    ...(since ? { 'where[createdAt][greater_than_equal]': since } : {}),
  }).toString();
}

/** Whether a rich text value has anything to post: text, or a node such as a mention or upload. */
export function hasContent(value: unknown): boolean {
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false;

    const { children, text, type } = node as Record<string, unknown>;

    if (typeof text === 'string') return text.trim() !== '';
    if (Array.isArray(children)) return children.some(visit);

    return typeof type === 'string' && type !== 'linebreak';
  };

  return visit((value as { root?: unknown } | null | undefined)?.root);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** When a comment was posted: "Just now", "6 minutes ago", "3 hours ago", then a date such as "Nov 15". */
export function formatWhen(iso: string, now = Date.now(), locale?: string): string {
  const at = Date.parse(iso);
  const ago = now - at;

  if (Number.isNaN(at)) return '';
  if (ago < MINUTE) return 'Just now';
  if (ago < HOUR) return plural(Math.floor(ago / MINUTE), 'minute');
  if (ago < DAY) return plural(Math.floor(ago / HOUR), 'hour');

  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(at);
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}
