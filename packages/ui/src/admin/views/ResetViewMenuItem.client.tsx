'use client';

import { PopupList, useConfig, usePathname, usePreferences, useRouter } from '@payloadcms/ui';
import { formatAdminURL } from 'payload/shared';

import { getGroupsPreferenceKey, getViewPreferenceKey } from './preferences.js';

/**
 * The view menu's "Reset to default": deletes the user's saved setup and collapsed groups for
 * this view and reloads
 * it with the view's config defaults. The list also drops Payload's own list preference.
 */
export function ResetViewMenuItem({
  collectionSlug,
  resetListPreference,
  viewSlug,
}: {
  collectionSlug: string;
  resetListPreference: boolean;
  viewSlug: string;
}) {
  const { config } = useConfig();
  const { syncPreference } = usePreferences();
  const pathname = usePathname();
  const router = useRouter();

  const reset = async () => {
    const keys = [
      getViewPreferenceKey(collectionSlug, viewSlug),
      getGroupsPreferenceKey(collectionSlug, viewSlug),
      ...(resetListPreference ? [`collection-${collectionSlug}`] : []),
    ];

    await Promise.all(
      keys.map((key) =>
        fetch(
          formatAdminURL({ apiRoute: config.routes.api, path: `/payload-preferences/${key}` }),
          {
            credentials: 'include',
            method: 'DELETE',
          },
        ),
      ),
    );

    for (const key of keys) syncPreference(key, undefined);

    router.push(pathname);
    router.refresh();
  };

  return (
    <PopupList.Button id="reset-view" onClick={() => void reset()}>
      Reset to default
    </PopupList.Button>
  );
}
