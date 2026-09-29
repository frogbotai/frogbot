import { getTranslation } from '@payloadcms/translations';
import type { EntityToGroup } from '@payloadcms/ui/shared';
import { EntityType, groupNavItems } from '@payloadcms/ui/shared';
import type { CustomComponent, SanitizedConfig, ServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

export type NavConfigItem = { icon?: CustomComponent; label: string; path: string };
type EntityIcon = CustomComponent | string;

export type BuildNavModelProps = {
  config: SanitizedConfig;
  i18n: ServerProps['i18n'];
  permissions: NonNullable<ServerProps['permissions']>;
  visibleEntities: NonNullable<ServerProps['visibleEntities']>;
};

export type SplitNavGroupsProps = {
  entities: EntityToGroup[];
  i18n: ServerProps['i18n'];
  permissions: NonNullable<ServerProps['permissions']>;
};

export function splitNavGroups({ entities, i18n, permissions }: SplitNavGroupsProps) {
  const defaultLabel = i18n.t('general:collections');
  const groups = groupNavItems(entities, permissions, i18n);

  return {
    groups: groups.filter(({ label }) => label !== defaultLabel),
    ungrouped: groups.find(({ label }) => label === defaultLabel)?.entities ?? [],
  };
}

export function buildCollectionGroups({
  config,
  i18n,
  permissions,
  visibleEntities,
}: BuildNavModelProps) {
  const entities = [
    ...config.collections
      .filter(({ slug }) => visibleEntities.collections.includes(slug))
      .map((entity) => ({ entity, type: EntityType.collection }) satisfies EntityToGroup),
    ...config.globals
      .filter(({ slug }) => visibleEntities.globals.includes(slug))
      .map((entity) => ({ entity, type: EntityType.global }) satisfies EntityToGroup),
  ];
  const entityByKey = new Map(
    entities.map(({ entity, type }) => [`${type}:${entity.slug}`, entity]),
  );
  const mapEntity = (entity: {
    label: Parameters<typeof getTranslation>[0];
    slug: string;
    type: EntityType;
  }) => {
    const label = getTranslation(entity.label, i18n);
    return {
      icon: (entityByKey.get(`${entity.type}:${entity.slug}`)?.admin as { icon?: EntityIcon })
        ?.icon,
      label: typeof label === 'string' ? label : entity.slug,
      path: formatAdminURL({
        adminRoute: config.routes.admin,
        path: `/${entity.type}/${entity.slug}`,
      }),
    };
  };

  const { groups, ungrouped } = splitNavGroups({
    entities: entities.filter(({ entity }) => entity.admin.group !== null),
    i18n,
    permissions,
  });

  return {
    entities,
    groups: groups.map(({ entities: groupedEntities, label }) => ({
      label,
      items: groupedEntities.map(mapEntity),
    })),
    items: ungrouped.map(mapEntity),
    mapEntity,
  };
}

export function buildNavModel({ config, i18n, permissions, visibleEntities }: BuildNavModelProps) {
  const { entities, mapEntity } = buildCollectionGroups({
    config,
    i18n,
    permissions,
    visibleEntities,
  });

  const topLevelItems = entities
    .filter(({ entity, type }) => {
      const entityPermissions = permissions[type]?.[entity.slug];

      return entity.admin.group === null && entityPermissions?.read;
    })
    .map(({ entity, type }) => {
      const label = 'labels' in entity ? entity.labels.plural : entity.label;

      return mapEntity({
        label,
        slug: entity.slug,
        type,
      });
    });

  const configuredItems = (
    config.admin.components as typeof config.admin.components & { navItems?: NavConfigItem[] }
  )?.navItems;

  return {
    items: [...(configuredItems ?? []), ...topLevelItems],
  };
}
