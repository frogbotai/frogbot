import type { DojoClient } from './dojo.js';
import { dojoMessage, segment } from './dojo.js';
import { ShareError } from './error.js';
import type { AppLink } from './link.js';
import { linkPath, writeLink } from './link.js';
import { findApp } from './nouns/resolve.js';

/** What `share` needs to know about the app it ships to. */
export type AppInfo = { started: boolean; level: 'editor' | 'owner' };

/** Stops with Dojo's words when it refuses the linked app, naming the link file. */
export async function refusedApp(appId: string | number, response: Response): Promise<void> {
  if (response.status !== 403 && response.status !== 404) return;

  throw new ShareError(
    `You can't share to the app in ${linkPath} (${appId}): ${await dojoMessage(response)} Delete ${linkPath} to share as a new app.`,
  );
}

/** The linked app's state on Dojo. */
export async function appInfo(dojo: DojoClient, appId: string | number): Promise<AppInfo> {
  const response = await dojo.request(`/api/apps/${segment(appId)}`);

  await refusedApp(appId, response);

  if (!response.ok) throw new ShareError(`Couldn't read the app: ${await dojoMessage(response)}`);

  const app = (await response.json()) as { started?: boolean; level?: string };

  return { started: app.started === true, level: app.level === 'editor' ? 'editor' : 'owner' };
}

/**
 * `share --app <slug or id>`: the app on Dojo, linked in `.frogbot/app.json` so later shares find it.
 * A folder already linked to another app stops, naming both.
 */
export async function appFromFlag({
  dojo,
  root,
  ref,
  folderLink,
}: {
  dojo: DojoClient;
  root: string;
  ref: string;
  folderLink: AppLink | undefined;
}): Promise<AppInfo & { link: AppLink }> {
  const app = await findApp(dojo, ref);

  if (folderLink && String(folderLink.appId) !== String(app.id)) {
    throw new ShareError(
      `This folder is linked to app ${folderLink.appId} in ${linkPath}, not ${app.slug} (${app.id}). Delete ${linkPath} to link it to ${app.slug}.`,
    );
  }

  const link = { appId: app.id };

  if (!folderLink) await writeLink(root, link);

  return { link, started: app.started, level: app.level === 'editor' ? 'editor' : 'owner' };
}
