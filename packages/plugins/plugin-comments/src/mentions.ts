import {
  convertLexicalToPlaintext,
  MentionPlaintextConverter,
} from '@frogbotai/richtext-lexical/plaintext';
import type { CollectionAfterChangeHook, FrogBotRequest } from 'frogbot';
import { toPayloadRequest } from 'frogbot/internal';

type Id = number | string;

type Doc = Record<string, unknown> & { id: Id };

type Notifications = {
  notify: (
    req: FrogBotRequest,
    input: { excerpt?: string; link?: string; source?: string; title: string; user: Id },
  ) => Promise<unknown>;
};

const NOTIFICATIONS_KEY = 'plugin-notifications';

/** How long an excerpt may be, in characters. */
export const EXCERPT_LENGTH = 140;

function idOf(value: unknown): Id | undefined {
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) return (value as Doc).id;

  return undefined;
}

function idsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(idOf).flatMap((id) => (id === undefined ? [] : [String(id)]))
    : [];
}

/** The comment's text, with mentions as `@Name`, clipped to `EXCERPT_LENGTH` characters. */
export function excerptOf(body: unknown): string {
  if (!body || typeof body !== 'object') return '';

  const text = convertLexicalToPlaintext({
    converters: MentionPlaintextConverter,
    data: body as Parameters<typeof convertLexicalToPlaintext>[0]['data'],
  })
    .replace(/\s+/g, ' ')
    .trim();

  const chars = Array.from(text);

  return chars.length > EXCERPT_LENGTH ? `${chars.slice(0, EXCERPT_LENGTH - 1).join('')}…` : text;
}

/** The users mentioned in `doc` that weren't in `previous` and aren't its author. */
export function newlyMentioned(doc: Doc, previous: Doc | undefined): string[] {
  const before = new Set(idsOf(previous?.mentions));
  const author = idOf(doc.author);

  return [...new Set(idsOf(doc.mentions))].filter((id) => !before.has(id) && id !== String(author));
}

function nameOf(user: Doc | undefined, titleField: string | undefined): string {
  for (const value of [titleField && user?.[titleField], user?.email]) {
    if (typeof value === 'string' && value) return value;
  }

  return 'Someone';
}

/**
 * With plugin-notifications installed, notifies each user a comment newly mentions, once: an edit
 * notifies only users it adds. A user who can't read the commented record isn't notified, so the
 * excerpt never reaches someone who couldn't open it.
 */
export function notifyMentions(userSlug: string): CollectionAfterChangeHook {
  return async ({ doc, operation, previousDoc, req }) => {
    const payload = toPayloadRequest(req).payload;
    const notifications = (payload.config.custom as Record<string, unknown> | undefined)?.[
      NOTIFICATIONS_KEY
    ] as Notifications | undefined;

    if (!notifications?.notify) return doc;

    const fresh = newlyMentioned(
      doc as Doc,
      operation === 'update' ? (previousDoc as Doc) : undefined,
    );

    if (!fresh.length) return doc;

    const authorId = idOf(doc.author);
    const { docs: people } = await req.frogbot.find({
      collection: userSlug,
      depth: 0,
      overrideAccess: true,
      pagination: false,
      req,
      where: { id: { in: authorId === undefined ? fresh : [...fresh, String(authorId)] } },
    });

    const byId = new Map(people.map((person) => [String(person.id), person]));
    const titleField = payload.collections[userSlug]?.config.admin?.useAsTitle;
    const author = authorId === undefined ? undefined : byId.get(String(authorId));
    const collection = String(doc.collection);
    const documentId = String(doc.documentId);
    const admin = payload.config.routes.admin;
    const link = `${admin === '/' ? '' : admin}/collections/${collection}/${documentId}`;
    const excerpt = excerptOf(doc.body ?? doc[doc.bodyField as string]);
    const title = `${nameOf(author, titleField)} mentioned you in a comment`;

    for (const id of fresh) {
      const person = byId.get(id);

      if (!person) continue;

      const canRead = await req.frogbot
        .findByID({
          collection,
          depth: 0,
          disableErrors: true,
          id: documentId,
          overrideAccess: false,
          select: {},
          user: { ...person, collection: userSlug },
        })
        .catch(() => null);

      if (!canRead) continue;

      await notifications.notify(req, {
        excerpt,
        link,
        source: 'plugin-comments',
        title,
        user: person.id,
      });
    }

    return doc;
  };
}
