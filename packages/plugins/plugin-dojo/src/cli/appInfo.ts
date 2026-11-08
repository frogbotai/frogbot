import type { DojoClient } from './dojo.js';
import { dojoMessage, segment } from './dojo.js';
import { ShareError } from './error.js';
import { linkPath } from './link.js';

export type AppInfo = { started: boolean; level: 'editor' | 'owner'; slug?: string };

/** Stops a share to a linked app Dojo refuses or no longer has, saying how to start over. */
export async function refusedApp(appId: string | number, response: Response): Promise<void> {
  if (response.status !== 403 && response.status !== 404) return;

  throw new ShareError(
    `You can't share to the app in ${linkPath} (${appId}): ${await dojoMessage(response)} Delete ${linkPath} to share as a new app.`,
  );
}

/** Whether the linked app has started, the caller's level on it, and its slug. */
export async function appInfo(dojo: DojoClient, appId: string | number): Promise<AppInfo> {
  const response = await dojo.request(`/api/apps/${segment(appId)}`);

  await refusedApp(appId, response);

  if (!response.ok) throw new ShareError(`Couldn't read the app: ${await dojoMessage(response)}`);

  const app = (await response.json()) as { started?: boolean; level?: string; slug?: unknown };

  return {
    started: app.started === true,
    level: app.level === 'editor' ? 'editor' : 'owner',
    slug: typeof app.slug === 'string' ? app.slug : undefined,
  };
}
