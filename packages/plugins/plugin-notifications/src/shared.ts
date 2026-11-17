/** Where the plugin keeps its config under the app config's `custom`. */
export const notificationsCustomKey = 'plugin-notifications';

export const defaultNotificationsSlug = 'notifications';

/** The inbox's path under the admin route. */
export const INBOX_PATH = '/notifications';

/** How many of the latest notifications the inbox shows. */
export const INBOX_LIMIT = 50;

/** The most the inbox shows at once, however far Load more goes. */
export const INBOX_MAX = 1000;

/** The inbox's `?limit=`: a whole number from `INBOX_LIMIT` to `INBOX_MAX`, or `INBOX_LIMIT`. */
export function inboxLimit(value: unknown): number {
  const limit = Math.floor(Number(value));

  return Number.isFinite(limit) ? Math.min(INBOX_MAX, Math.max(INBOX_LIMIT, limit)) : INBOX_LIMIT;
}

/** The bell's badge text: the count, or `99+`. */
export function badge(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Joins the admin route and a path, so `/` as the admin route gives `/notifications`. */
export function adminPath(adminRoute: string, path: string): string {
  return `${adminRoute === '/' ? '' : adminRoute.replace(/\/$/, '')}${path}`;
}
