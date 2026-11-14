import type { DojoClient } from './dojo.js';
import { segment } from './dojo.js';
import { dojoStop, ShareError } from './error.js';
import type { AppLink } from './link.js';
import { linkPath } from './link.js';
import { findApp } from './nouns/resolve.js';

/** What a deploy needs to know about the app it ships to. */
export type AppInfo = { started: boolean; level: 'editor' | 'owner'; slug?: string };

/** Stops with Dojo's words when it refuses the linked app, naming the link file. */
export async function refusedApp(appId: string | number, response: Response): Promise<void> {
  if (response.status !== 403 && response.status !== 404) return;

  throw await dojoStop(
    response,
    `You can't deploy to the app in ${linkPath} (${appId})`,
    ` Delete ${linkPath} to deploy as a new app.`,
  );
}

/** The linked app's state on Dojo, from `GET /api/apps/:app/cli`. */
export async function appInfo(dojo: DojoClient, appId: string | number): Promise<AppInfo> {
  const response = await dojo.request(`/api/apps/${segment(appId)}/cli`);

  await refusedApp(appId, response);

  if (!response.ok) throw await dojoStop(response, "Couldn't read the app");

  const app = (await response.json()) as { started?: boolean; level?: string; slug?: unknown };

  return {
    started: app.started === true,
    level: app.level === 'editor' ? 'editor' : 'owner',
    slug: typeof app.slug === 'string' ? app.slug : undefined,
  };
}

/**
 * `frogbot deploy --app <slug or id>`: the app on Dojo, and the link the deploy writes to `.frogbot/app.json` once
 * Dojo accepts the upload. A folder already linked to another app stops, naming both.
 */
export async function appFromFlag({
  dojo,
  ref,
  folderLink,
}: {
  dojo: DojoClient;
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

  return {
    link,
    started: app.started,
    level: app.level === 'editor' ? 'editor' : 'owner',
    slug: app.slug,
  };
}
