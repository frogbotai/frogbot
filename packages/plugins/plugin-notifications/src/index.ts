import { definePlugin, type FrogBotConfig, type Plugin } from 'frogbot';

import { createNotificationsCollection } from './collection.js';
import { notify } from './notify.js';
import { defaultNotificationsSlug, INBOX_PATH, notificationsCustomKey } from './shared.js';
import type { NotificationsConfig, NotificationsPluginOptions } from './types.js';

export { notificationsConfig, notify } from './notify.js';
export type {
  NotificationDoc,
  NotificationsCollectionOverrides,
  NotificationsConfig,
  NotificationsPluginOptions,
  Notify,
  NotifyInput,
} from './types.js';

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-notifications': NotificationsPluginOptions;
  }
}

const BELL = '@frogbotai/plugin-notifications/rsc#NotificationsBell';

function userSlug(config: FrogBotConfig): string {
  const authSlugs = config.collections
    .filter((collection) => collection.auth !== undefined && collection.auth !== false)
    .map((collection) => collection.slug);

  if (authSlugs.length === 0) return 'users';
  if (authSlugs.length === 1) return authSlugs[0];
  if (config.admin?.user && authSlugs.includes(config.admin.user)) return config.admin.user;
  throw new Error('[plugin-notifications] Set admin.user when multiple auth collections exist.');
}

const notifications = definePlugin<NotificationsPluginOptions>({
  slug: 'plugin-notifications',
  order: 90,
  plugin: ({ config, options }) => {
    const slug = options.overrides?.slug ?? defaultNotificationsSlug;

    if (config.collections.some((collection) => collection.slug === slug)) {
      throw new Error(`[plugin-notifications] Collection slug '${slug}' already exists.`);
    }

    const users = userSlug(config);
    const custom: NotificationsConfig = { notify, slug, userSlug: users };

    return {
      ...config,
      collections: [
        ...config.collections,
        createNotificationsCollection({ overrides: options.overrides ?? {}, userSlug: users }),
      ],
      admin: {
        ...config.admin,
        components: {
          ...config.admin?.components,
          actions: [...(config.admin?.components?.actions ?? []), BELL],
          views: {
            ...config.admin?.components?.views,
            notifications: {
              Component: '@frogbotai/plugin-notifications/rsc#InboxView',
              exact: true,
              meta: { title: 'Notifications' },
              path: INBOX_PATH,
            },
          },
        },
      },
      custom: { ...config.custom, [notificationsCustomKey]: custom },
    };
  },
});

/**
 * In-app notifications. Adds a `notifications` collection that each user reads only their own
 * rows of, a bell in the admin header with the unread count, an inbox at `/admin/notifications`,
 * and `notify()` for any hook or job. With plugin-comments, a new @mention notifies that user.
 */
export function notificationsPlugin(options: NotificationsPluginOptions = {}): Plugin {
  if (options.overrides?.slug === '') {
    throw new Error('[plugin-notifications] overrides.slug cannot be empty.');
  }

  return notifications(options);
}
