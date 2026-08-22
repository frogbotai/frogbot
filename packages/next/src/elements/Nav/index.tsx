import { getTranslation } from '@payloadcms/translations';
import { Logout } from '@payloadcms/ui';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { EntityToGroup } from '@payloadcms/ui/shared';
import { EntityType, groupNavItems } from '@payloadcms/ui/shared';
import type { CustomComponent, NavPreferences, PayloadRequest, ServerProps } from 'payload';
import { formatAdminURL, PREFERENCE_KEYS } from 'payload/shared';

import { FrogbotNavClient } from './index.client.js';

type NavConfigItem = { icon?: CustomComponent; label: string; path: string };

async function getNavPreferences(req?: PayloadRequest): Promise<NavPreferences | null> {
  if (!req?.user?.collection) return null;
  const result = await req.payload.find({
    collection: 'payload-preferences',
    depth: 0,
    limit: 1,
    pagination: false,
    req,
    where: {
      and: [
        { key: { equals: PREFERENCE_KEYS.NAV } },
        { 'user.relationTo': { equals: req.user.collection } },
        { 'user.value': { equals: req.user.id } },
      ],
    },
  });
  return result.docs[0]?.value as NavPreferences | null;
}

export type FrogbotNavProps = { req?: PayloadRequest } & ServerProps;

export async function FrogbotNav(props: FrogbotNavProps) {
  const {
    documentSubViewType,
    i18n,
    locale,
    params,
    payload,
    permissions,
    req,
    searchParams,
    user,
    viewType,
    visibleEntities,
  } = props;
  if (!payload?.config || !permissions || !visibleEntities) return null;

  const { admin, collections, globals, routes } = payload.config;
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
  const navPreferences = await getNavPreferences(req);
  const serverProps = { i18n, locale, params, payload, permissions, searchParams, user };
  const clientProps = { documentSubViewType, viewType };
  const render = (Component: Parameters<typeof RenderServerComponent>[0]['Component'], key?: string) =>
    RenderServerComponent({ Component, clientProps, importMap: payload.importMap, key, serverProps });
  const configuredItems = ((admin as typeof admin & { nav?: { items?: NavConfigItem[] } }).nav?.items ?? []).map(
    (item) => ({
      ...item,
      icon: item.icon
        ? RenderServerComponent({
            Component: item.icon,
            clientProps: { className: 'frogbot-admin-sidebar__icon', size: 24 },
            importMap: payload.importMap,
            serverProps,
          })
        : undefined,
    }),
  );
  const mappedGroups = groups.map(({ entities, label }) => ({
    label,
    open: navPreferences?.groups?.[label]?.open,
    items: entities.map((entity) => ({
      label: getTranslation(entity.label, i18n),
      path: formatAdminURL({
        adminRoute: routes.admin,
        path: `/${entity.type}/${entity.slug}`,
      }),
    })),
  }));
  const beforeNavLinks = admin.components.beforeNavLinks?.map((component, index) =>
    render(component, `before-nav-${index}`),
  );
  const afterNavLinks = admin.components.afterNavLinks?.map((component, index) =>
    render(component, `after-nav-${index}`),
  );
  const settings = Array.isArray(admin.components.settingsMenu)
    ? admin.components.settingsMenu.map((component, index) => render(component, `settings-${index}`))
    : [];
  const logout = RenderServerComponent({
    Component: admin.components.logout?.Button,
    Fallback: Logout,
    clientProps,
    importMap: payload.importMap,
    serverProps,
  });
  const logo = render(admin.components.graphics?.Icon);
  const homePath = formatAdminURL({ adminRoute: routes.admin, path: '/' });

  return (
    <FrogbotNavClient
      afterNavLinks={afterNavLinks}
      beforeNavLinks={beforeNavLinks}
      bottom={<>{settings}{logout}</>}
      groups={mappedGroups}
      homePath={homePath}
      items={configuredItems}
      logo={logo}
    />
  );
}
