import type { VerbFlag } from '../command.js';
import type { DojoClient } from '../dojo.js';
import { dojoJSON, dojoList, segment } from '../dojo.js';
import { ShareError } from '../error.js';
import { count, whereEquals } from './resolve.js';

/** An app in Trash, as `GET /api/apps?trash=true` lists it. */
export type TrashedApp = { id: string | number; name: string; slug: string };

/** `--purge-trash` on a delete that Dojo refuses while apps in Trash remain. */
export const purgeTrashFlag = (what: 'workspace' | 'project'): VerbFlag => ({
  type: 'boolean',
  help: `First delete this ${what}'s apps in Trash for good. Apps outside Trash still block the delete.`,
});

/** The apps in Trash whose `field` is `id`: the ones holding up that workspace's or project's delete. */
export async function trashedApps(
  dojo: DojoClient,
  field: 'workspace' | 'project',
  id: string | number,
): Promise<TrashedApp[]> {
  const apps = await dojoList<TrashedApp>(
    dojo,
    `/api/apps?depth=0&limit=100&trash=true&where[deletedAt][exists]=true&${whereEquals(field, id)}`,
    { what: `Couldn't list the ${field}'s apps in Trash` },
  );

  return apps.map(({ id: appId, name, slug }) => ({ id: appId, name, slug }));
}

/** `2 apps in Trash (a, b) are deleted for good first.`, for the confirmation. */
export function purgeNotice(apps: TrashedApp[]): string {
  return apps.length
    ? ` ${count(apps.length, 'app')} in Trash (${apps.map(({ slug }) => slug).join(', ')}) ${apps.length === 1 ? 'is' : 'are'} deleted for good first.`
    : '';
}

/** Deletes each app for good, by its name as Dojo asks. */
export async function purgeApps(dojo: DojoClient, apps: TrashedApp[]): Promise<void> {
  for (const app of apps) {
    await dojoJSON<{ deleted: boolean }>(dojo, `/api/apps/${segment(app.id)}/delete-permanently`, {
      method: 'POST',
      body: { name: app.name.trim() },
      what: `Dojo couldn't delete ${app.slug} for good`,
      needs: 'Admin access to the app',
    });
  }
}

/**
 * Sends a delete; when Dojo refuses it because apps remain (409) and `--purge-trash` wasn't given, the refusal names
 * the flag.
 */
export async function namingPurge<T>(purged: boolean, send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (purged || !(error instanceof ShareError) || error.status !== 409) throw error;

    throw new ShareError(
      `${error.message} Rerun with --purge-trash to delete its apps in Trash for good first.`,
      error.exitCode,
      { code: error.code, status: error.status, url: error.url },
    );
  }
}
