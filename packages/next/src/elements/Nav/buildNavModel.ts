import { getTranslation } from '@payloadcms/translations';
import type { EntityToGroup } from '@payloadcms/ui/shared';
import { EntityType, groupNavItems } from '@payloadcms/ui/shared';
import type { CustomComponent, SanitizedConfig, ServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

export type NavConfigItem = { icon?: CustomComponent; label: string; path: string };
type EntityIcon = CustomComponent | string;

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
  const entities = [
    ...collections
      .filter(({ slug }) => visibleEntities.collections.includes(slug))
      .map((entity) => ({ entity, type: EntityType.collection }) satisfies EntityToGroup),
    ...globals
      .filter(({ slug }) => visibleEntities.globals.includes(slug))
      .map((entity) => ({ entity, type: EntityType.global }) satisfies EntityToGroup),
  ];
  const groupedEntities = entities.filter(({ entity }) => entity.admin.group !== null);
  const groups = groupNavItems(
    groupedEntities,
    permissions,
    i18n,
  );
  const entityByKey = new Map(entities.map(({ entity, type }) => [`${type}:${entity.slug}`, entity]));
  const mapEntity = (entity: { label: Parameters<typeof getTranslation>[0]; slug: string; type: EntityType }) => ({
    icon: (entityByKey.get(`${entity.type}:${entity.slug}`)?.admin as { icon?: EntityIcon })?.icon,
    label: getTranslation(entity.label, i18n),
    path: formatAdminURL({ adminRoute: routes.admin, path: `/${entity.type}/${entity.slug}` }),
  });
  const topLevelItems = entities
    .filter(({ entity, type }) => {
      const entityPermissions = permissions[type]?.[entity.slug];
      return entity.admin.group === null && entityPermissions?.read;
    })
    .map(({ entity, type }) => {
      const label = 'labels' in entity ? entity.labels.plural : entity.label;
      return mapEntity({ label: typeof label === 'function' ? label({ i18n, t: i18n.t }) : label, slug: entity.slug, type });
    });

  return {
    groups: groups.map(({ entities, label }) => ({
      label,
      items: entities.map(mapEntity),
    })),
    items: [
      ...((admin as typeof admin & { nav?: { items?: NavConfigItem[] } }).nav?.items ?? []),
      ...topLevelItems,
    ],
  };
}
