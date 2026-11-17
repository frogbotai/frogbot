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
    input: {
      actor?: Id;
      excerpt?: string;
      kind?: string;
      link?: string;
      source?: string;
      title: string;
      user: Id;
    },
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

/**
 * Who a save should notify: users `mentions` names that the comment never notified before and
 * that aren't its author. `notified` is everyone the comment has ever mentioned, so a mention
 * that is removed and added back is not new.
 */
export function mentionChanges(args: { author: unknown; mentions: unknown; notified: unknown }): {
  fresh: string[];
  notified: Id[];
} {
  const ids = (value: unknown) =>
    Array.isArray(value) ? value.map(idOf).filter((id): id is Id => id !== undefined) : [];

  const before = ids(args.notified);
  const seen = new Set(before.map(String));
  const author = String(idOf(args.author));
  const added = ids(args.mentions).filter((id) => {
    const key = String(id);

    if (seen.has(key) || key === author) return false;

    seen.add(key);

    return true;
  });

  return { fresh: added.map(String), notified: [...before, ...added] };
}

function asUser(req: FrogBotRequest, user: unknown): FrogBotRequest {
  const own = { user };
  const pick = (key: PropertyKey) => (key === 'user' ? own : req);

  return new Proxy(req, {
    get: (_target, key) => Reflect.get(pick(key), key, pick(key)),
    has: (_target, key) => Reflect.has(pick(key), key),
    set: (_target, key, value) => Reflect.set(pick(key), key, value, pick(key)),
  });
}

function nameOf(user: Doc | undefined, titleField: string | undefined): string {
  for (const value of [titleField && user?.[titleField], user?.email]) {
    if (typeof value === 'string' && value) return value;
  }

  return 'Someone';
}

/**
 * With plugin-notifications installed, notifies the users this save added to `notified`, once per
 * comment. A user who can't read the commented record isn't notified, so the excerpt never
 * reaches someone who couldn't open it. Reads the save's `data` and `previousDoc`, never the
 * returned `doc`, which `select` can trim. Runs in the caller's transaction.
 */
export function notifyMentions(userSlug: string): CollectionAfterChangeHook {
  return async ({ data, doc, previousDoc, req }) => {
    const saved = { ...previousDoc, ...data } as Record<string, unknown>;
    const { fresh } = mentionChanges({
      author: saved.author,
      mentions: data.notified,
      notified: previousDoc?.notified,
    });

    const payload = toPayloadRequest(req).payload;
    const notifications = (payload.config.custom as Record<string, unknown> | undefined)?.[
      NOTIFICATIONS_KEY
    ] as Notifications | undefined;

    if (!notifications?.notify || !fresh.length) return doc;

    const authorId = idOf(saved.author);
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
    const collection = String(saved.collection);
    const documentId = String(saved.documentId);
    const admin = payload.config.routes.admin;
    const link = `${admin === '/' ? '' : admin}/collections/${collection}/${documentId}`;
    const excerpt = excerptOf(saved[saved.bodyField as string]);
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
          req: asUser(req, { ...person, collection: userSlug }),
          select: {},
        })
        .catch(() => null);

      if (!canRead) continue;

      await notifications.notify(req, {
        actor: authorId,
        excerpt,
        kind: 'mention',
        link,
        source: 'plugin-comments',
        title,
        user: person.id,
      });
    }

    return doc;
  };
}
