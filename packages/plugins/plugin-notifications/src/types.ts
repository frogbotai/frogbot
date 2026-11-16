import type { CollectionConfig, Field, FrogBotRequest } from 'frogbot';

/** Overrides for the notifications collection, in Payload's collection-override shape. */
export type NotificationsCollectionOverrides = Partial<Omit<CollectionConfig, 'fields'>> & {
  fields?: (args: { defaultFields: Field[] }) => Field[];
};

export type NotificationsPluginOptions = {
  /** Adds the bell to the admin header. Set `false` to place your own entry point. Default `true`. */
  bell?: boolean;
  overrides?: NotificationsCollectionOverrides;
};

/** The fields `notify()` knows. */
export type NotifyFields = {
  /** The user who caused it, by id, such as a comment's author. */
  actor?: number | string;
  /** A short plain-text preview, such as the start of a comment. */
  excerpt?: string;
  /** Where opening the notification goes, such as `/admin/collections/deals/12`. */
  link?: string;
  /** What happened, such as `mention` or `assigned`, for filtering. */
  kind?: string;
  /** What sent it, such as `plugin-comments`. */
  source?: string;
  /** One line saying what happened, such as `Ana mentioned you`. */
  title: string;
  /** The user to notify, by id. */
  user: number | string;
};

/**
 * What `notify()` stores for one user: the known fields, plus any field added to the collection
 * with `overrides.fields`, such as an `archivedAt` date.
 */
export type NotifyInput = NotifyFields & { [field: string]: unknown };

/** A stored notification. */
export type NotificationDoc = Omit<NotifyFields, 'actor' | 'user'> & {
  actor?: null | number | string | { id: number | string };
  createdAt: string;
  id: number | string;
  readAt?: null | string;
  user: number | string | { id: number | string };
};

/** Sends one in-app notification. */
export type Notify = (req: FrogBotRequest, input: NotifyInput) => Promise<NotificationDoc>;

/** What the plugin stores in the config's `custom`, under `plugin-notifications`. */
export type NotificationsConfig = {
  /** `notify()`, so other plugins can send without importing this package. */
  notify: Notify;
  slug: string;
  userSlug: string;
};
