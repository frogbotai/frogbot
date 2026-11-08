import type { SanitizedCollectionConfig } from 'payload';
import { formatAdminURL } from 'payload/shared';

/**
 * With `admin.panel: false`, sends `?record=<id>` to the record's edit page, so links copied from
 * a panel keep working after it's turned off.
 */
export function redirectRecordParam({
  adminRoute,
  collectionConfig,
  record,
  redirect,
}: {
  adminRoute: string;
  collectionConfig: SanitizedCollectionConfig;
  record: unknown;
  redirect: (url: string) => never | void;
}): void {
  const id = Array.isArray(record) ? record[0] : record;
  if (typeof id !== 'string' || !id) return;
  const panel = (collectionConfig.admin?.custom?.frogbot as { panel?: unknown } | undefined)?.panel;
  if (panel !== false) return;

  redirect(
    formatAdminURL({
      adminRoute,
      path: `/collections/${collectionConfig.slug}/${encodeURIComponent(id)}`,
    }),
  );
}
