import { getTranslation } from '@payloadcms/translations';
import type { AdminIcon, FrogBotRequest } from 'frogbot';
import type { SanitizedConfig, ServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

import {
  getSettingsCollections,
  getSettingsEntries,
  resolveSettingsSection,
} from '../../views/Settings/resolveSection.js';

export type SettingsNavModelItem = {
  href: string;
  icon?: AdminIcon;
  kind: 'collection' | 'collections' | 'entry';
  label: string;
};

export type SettingsNavModel = {
  accountHref: string;
  backHref: string;
  items: SettingsNavModelItem[];
};

export type BuildSettingsNavProps = {
  config: SanitizedConfig;
  permissions: NonNullable<ServerProps['permissions']>;
  req: FrogBotRequest;
  visibleEntities: NonNullable<ServerProps['visibleEntities']>;
};

/** The Settings sidebar in order: Collections, Settings collections, then accessible `settings` entries. */
export async function buildSettingsNav({
  config,
  permissions,
  req,
  visibleEntities,
}: BuildSettingsNavProps): Promise<SettingsNavModel> {
  const adminRoute = config.routes.admin;
  const href = (path: '' | `/${string}`) => formatAdminURL({ adminRoute, path });

  const { accessible } = await resolveSettingsSection({
    entries: getSettingsEntries(config),
    req,
    routePath: '',
  });

  const collections = getSettingsCollections(config).filter(
    ({ slug }) =>
      visibleEntities.collections.includes(slug) && permissions.collections?.[slug]?.read,
  );

  return {
    accountHref: href(config.admin.routes.account),
    backHref: href(''),
    items: [
      { href: href('/settings/collections'), kind: 'collections', label: 'Collections' },
      ...collections.map((collection) => ({
        href: href(`/collections/${collection.slug}`),
        icon: (collection.admin as { icon?: AdminIcon }).icon,
        kind: 'collection' as const,
        label: getTranslation(collection.labels.plural, req.i18n),
      })),
      ...accessible.map((entry) => ({
        href: href(`/settings/${entry.path}`),
        icon: entry.icon,
        kind: 'entry' as const,
        label: getTranslation(entry.label, req.i18n),
      })),
    ],
  };
}
