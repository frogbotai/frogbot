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
  program: string,
): Promise<TrashedApp[]> {
  const apps = await dojoList<TrashedApp & { deletedAt?: string | null }>(
    dojo,
    `/api/apps?depth=0&limit=100&trash=true&${whereEquals(field, id)}`,
    { what: `Couldn't list the apps of ${name}` },
  );

  const live = apps.filter(({ deletedAt }) => !deletedAt).map(({ slug }) => slug);

  if (live.length > 0) {
    throw new ShareError(
      `${name} still holds ${count(live.length, 'app')} outside Trash (${live.join(', ')}), so nothing was deleted. Move each with ${program} apps move or delete it with ${program} apps delete, then rerun with --purge-trash.`,
    );
  }

  return apps.map(({ id: appId, name: appName, slug }) => ({ id: appId, name: appName, slug }));
}

/** `2 apps in Trash (a, b) are deleted for good first.`, for the confirmation. */
export function purgeNotice(apps: TrashedApp[]): string {
  return apps.length
    ? ` ${count(apps.length, 'app')} in Trash (${apps.map(({ slug }) => slug).join(', ')}) ${apps.length === 1 ? 'is' : 'are'} deleted for good first, even if apps you can't see still block the delete.`
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
        { ...carried(error), purged: gone },
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

const carried = (error: ShareError) => ({
  code: error.code,
  status: error.status,
  url: error.url,
  ...error.step,
});

/**
 * Sends a delete. After a purge (`purged` holds the slugs, possibly none), any refusal names what was already
 * deleted for good, in its text and its `purged`. A refusal because apps remain (409) also names the next step:
 * without `--purge-trash` that is the flag; after a purge the apps left are ones the caller can't see, so it names
 * who can move them.
 */
export async function namingPurge<T>(
  purged: string[] | undefined,
  program: string,
  send: () => Promise<T>,
): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (!(error instanceof ShareError)) throw error;

    const gone = purged?.length ? `Already deleted for good from Trash: ${purged.join(', ')}.` : '';
    const left =
      error.status !== 409
        ? ''
        : purged
          ? `The apps left are ones you can't see: their Admins can move them with ${program} apps move or delete them with ${program} apps delete, then rerun.`
          : `Rerun with --purge-trash to delete its apps in Trash for good first; apps outside Trash need ${program} apps move or ${program} apps delete.`;

    const next = [gone, left].filter(Boolean).join(' ');

    if (!next) throw error;

    throw new ShareError(`${error.message} ${next}`, error.exitCode, {
      ...carried(error),
      purged: purged?.length ? purged : undefined,
    });
  }
}
