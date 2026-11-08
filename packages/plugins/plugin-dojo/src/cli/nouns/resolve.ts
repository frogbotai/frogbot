import type { DojoClient } from '../dojo.js';
import { dojoJSON, segment } from '../dojo.js';
import { ShareError } from '../error.js';

/** An app as `GET /api/apps/:app` describes it to its editors and owners. */
export type DojoApp = {
  id: string | number;
  slug: string;
  started: boolean;
  level?: 'editor' | 'owner';
};

/**
 * The app named by slug or id, read with `GET /api/apps/:app`. Refuses digits that are one app's id
 * and another app's slug.
 */
export async function findApp(dojo: DojoClient, ref: string): Promise<DojoApp> {
  const app = await dojoJSON<Partial<DojoApp>>(dojo, `/api/apps/${segment(ref)}`, {
    what: `Couldn't find the app "${ref}"`,
    needs: 'editor or owner access to the app',
  });

  if ((typeof app.id !== 'string' && typeof app.id !== 'number') || typeof app.slug !== 'string') {
    throw new ShareError("Couldn't read the app: Dojo sent no id or slug.");
  }

  if (/^\d+$/.test(ref) && app.slug !== ref) {
    const { docs } = await dojoJSON<{ docs: unknown[] }>(
      dojo,
      `/api/projects?depth=0&limit=1&${whereEquals('slug', ref)}`,
      { what: `Couldn't find the app "${ref}"` },
    );

    if (docs.length > 0) {
      throw new ShareError(
        `"${ref}" is the id of ${app.slug} and the slug of another app. Name that app by its id.`,
      );
    }
  }

  return { id: app.id, slug: app.slug, started: app.started === true, level: app.level };
}

/** The live address of an app on Dojo. */
export function appAddress(slug: string): string {
  return `https://${slug}.frogbot.app`;
}

/** Payload's `where` query for one field equal to a value. */
export function whereEquals(field: string, value: string | number): string {
  return `where[${field}][equals]=${encodeURIComponent(String(value))}`;
}

/** `1 app`, `2 apps`. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
