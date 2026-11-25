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

/**
 * The apps in Trash whose `field` is `id`, the ones `--purge-trash` deletes. Apps outside Trash still block the delete,
 * so they are refused here, before anything is deleted for good.
 */
export async function trashedApps(
  dojo: DojoClient,
  field: 'workspace' | 'project',
  id: string | number,
  name: string,
): Promise<TrashedApp[]> {
  const apps = await dojoList<TrashedApp & { deletedAt?: string | null }>(
    dojo,
    `/api/apps?depth=0&limit=100&trash=true&${whereEquals(field, id)}`,
    { what: `Couldn't list the apps of ${name}` },
  );

  const live = apps.filter(({ deletedAt }) => !deletedAt).map(({ slug }) => slug);

  if (live.length > 0) {
    throw new ShareError(
      `${name} still holds ${count(live.length, 'app')} outside Trash (${live.join(', ')}), so nothing was deleted. Move each with apps move or delete it with apps delete, then rerun with --purge-trash.`,
    );
  }

  return apps.map(({ id: appId, name: appName, slug }) => ({ id: appId, name: appName, slug }));
}

/** `2 apps in Trash (a, b) are deleted for good first.`, for the confirmation. */
export function purgeNotice(apps: TrashedApp[]): string {
  return apps.length
    ? ` ${count(apps.length, 'app')} in Trash (${apps.map(({ slug }) => slug).join(', ')}) ${apps.length === 1 ? 'is' : 'are'} deleted for good first.`
    : '';
}

/** Deletes each app for good, by its name as Dojo asks. */
export async function purgeApps(dojo: DojoClient, apps: TrashedApp[]): Promise<void> {
  for (const [index, app] of apps.entries()) {
    await purgeOne(dojo, app).catch((error: unknown) => {
      const gone = apps.slice(0, index).map(({ slug }) => slug);

      if (!(error instanceof ShareError) || gone.length === 0) throw error;

      throw new ShareError(
        `${error.message} Already deleted for good: ${gone.join(', ')}. Rerun to carry on.`,
        error.exitCode,
        { code: error.code, status: error.status, url: error.url },
      );
    });
  }
}

async function purgeOne(dojo: DojoClient, app: TrashedApp): Promise<void> {
  await dojoJSON<{ deleted: boolean }>(dojo, `/api/apps/${segment(app.id)}/delete-permanently`, {
    method: 'POST',
    body: { name: app.name.trim() },
    what: `Dojo couldn't delete ${app.slug} for good`,
    needs: 'Admin access to the app',
  });
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
      `${error.message} Rerun with --purge-trash to delete its apps in Trash for good first; apps outside Trash need apps move or apps delete.`,
      error.exitCode,
      { code: error.code, status: error.status, url: error.url },
    );
  }
}
