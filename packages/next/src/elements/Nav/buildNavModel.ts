import { getTranslation } from '@payloadcms/translations';
import type { EntityToGroup } from '@payloadcms/ui/shared';
import { EntityType, groupNavItems } from '@payloadcms/ui/shared';
import type { CustomComponent, SanitizedConfig, ServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

export type NavConfigItem = { icon?: CustomComponent; label: string; path: string };
type EntityIcon = CustomComponent | string;

export type BuildNavModelProps = {
  chatsSlug?: string;
  config: SanitizedConfig;
  i18n: ServerProps['i18n'];
  permissions: NonNullable<ServerProps['permissions']>;
  visibleEntities: NonNullable<ServerProps['visibleEntities']>;
};

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

  return {
    entities,
    groups: groupNavItems(
      entities.filter(({ entity }) => entity.admin.group !== null),
      permissions,
      i18n,
    ).map(({ entities: groupedEntities, label }) => ({
      label,
      items: groupedEntities.map(mapEntity),
    })),
    mapEntity,
  };
}

export function buildNavModel({
  chatsSlug = 'chats',
  config,
  i18n,
  permissions,
  visibleEntities,
}: BuildNavModelProps) {
  const { admin, routes } = config;
  const { entities, groups, mapEntity } = buildCollectionGroups({
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
    admin.components as typeof admin.components & { navItems?: NavConfigItem[] }
  )?.navItems;
  const newChatItem: NavConfigItem = {
    icon: 'pencil-edit',
    label: 'New Chat',
    path: formatAdminURL({
      adminRoute: routes.admin,
      path: `/collections/${chatsSlug}/create`,
    }),
  };

  return {
    groups,
    items: [...(configuredItems ?? [newChatItem]), ...topLevelItems],
  };
}
