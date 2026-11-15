import type { FrogBotRequest } from 'frogbot';
import { toPayloadRequest } from 'frogbot/internal';

import { notificationsCustomKey } from './shared.js';
import type { NotificationDoc, NotificationsConfig, NotifyInput } from './types.js';

/** The plugin's config from the request's app config, or `undefined` when it isn't installed. */
export function notificationsConfig(req: FrogBotRequest): NotificationsConfig | undefined {
  const custom = toPayloadRequest(req).payload.config.custom as Record<string, unknown> | undefined;

  return custom?.[notificationsCustomKey] as NotificationsConfig | undefined;
}

/**
 * Sends `input.user` an in-app notification: it shows in their bell and inbox. Call it from any
 * hook, endpoint or job with that call's `req`, so it joins the same transaction. Access is not
 * checked: this is trusted server code deciding who to tell.
 */
export async function notify(req: FrogBotRequest, input: NotifyInput): Promise<NotificationDoc> {
  const config = notificationsConfig(req);

  if (!config) {
    throw new Error('[plugin-notifications] Add notificationsPlugin() to plugins to use notify().');
  }

  const { excerpt, link, source, title, user } = input;

  if (!title.trim()) throw new Error('[plugin-notifications] notify() needs a title.');

  const doc = await req.frogbot.create({
    collection: config.slug,
    data: { excerpt, link, source, title, user },
    depth: 0,
    overrideAccess: true,
    req,
  });

  return doc as NotificationDoc;
}
