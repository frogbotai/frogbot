import type { SanitizedCollectionConfig } from 'payload';

/**
 * With `admin.panel: false`, sends `?record=<id>` to the record's edit page, so links copied from
 * a panel keep working after it's turned off. `redirect` gets the admin path to go to.
 */
export function redirectRecordParam({
  collectionConfig,
  record,
  redirect,
}: {
  collectionConfig: SanitizedCollectionConfig;
  record: unknown;
  redirect: (path: `/${string}`) => void;
}): void {
  const id = Array.isArray(record) ? record[0] : record;
  if (typeof id !== 'string' || !id) return;
  const panel = (collectionConfig.admin?.custom?.frogbot as { panel?: unknown } | undefined)?.panel;
  if (panel !== false) return;

  redirect(`/collections/${collectionConfig.slug}/${encodeURIComponent(id)}`);
}
