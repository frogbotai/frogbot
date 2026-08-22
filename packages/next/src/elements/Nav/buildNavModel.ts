import { getTranslation } from '@payloadcms/translations';
import type { EntityToGroup } from '@payloadcms/ui/shared';
import { EntityType, groupNavItems } from '@payloadcms/ui/shared';
import type { CustomComponent, SanitizedConfig, ServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

export type NavConfigItem = { icon?: CustomComponent; label: string; path: string };

type BuildNavModelProps = {
  config: SanitizedConfig;
  i18n: ServerProps['i18n'];
  permissions: NonNullable<ServerProps['permissions']>;
  visibleEntities: NonNullable<ServerProps['visibleEntities']>;
};

export function buildNavModel({
  config,
  i18n,
  permissions,
  visibleEntities,
}: BuildNavModelProps) {
  const { admin, collections, globals, routes } = config;
  const groups = groupNavItems(
    [
      ...collections
        .filter(({ slug }) => visibleEntities.collections.includes(slug))
        .map((entity) => ({ entity, type: EntityType.collection }) satisfies EntityToGroup),
      ...globals
        .filter(({ slug }) => visibleEntities.globals.includes(slug))
        .map((entity) => ({ entity, type: EntityType.global }) satisfies EntityToGroup),
    ],
    permissions,
    i18n,
  );

  return {
    groups: groups.map(({ entities, label }) => ({
      label,
      items: entities.map((entity) => ({
        label: getTranslation(entity.label, i18n),
        path: formatAdminURL({
          adminRoute: routes.admin,
          path: `/${entity.type}/${entity.slug}`,
        }),
      })),
    })),
    items: ((admin as typeof admin & { nav?: { items?: NavConfigItem[] } }).nav?.items ?? []),
  };
}
