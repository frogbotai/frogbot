import { Account } from '@payloadcms/ui';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import { getCachedFrogbot } from 'frogbot';
import type { NavPreferences, PayloadRequest, ServerProps } from 'payload';
import { formatAdminURL, PREFERENCE_KEYS } from 'payload/shared';

import { buildNavModel } from './buildNavModel.js';
import { FrogbotNavClient } from './index.client.js';

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

  const { admin, routes } = payload.config;
  const shellComponents = admin.components as typeof admin.components & {
    afterAccountMenu?: Parameters<typeof RenderServerComponent>[0]['Component'][];
    afterBottomRail?: Parameters<typeof RenderServerComponent>[0]['Component'][];
    beforeAccountMenu?: Parameters<typeof RenderServerComponent>[0]['Component'][];
    beforeBottomRail?: Parameters<typeof RenderServerComponent>[0]['Component'][];
    beforeSidebarClose?: Parameters<typeof RenderServerComponent>[0]['Component'][];
    navSections?: Parameters<typeof RenderServerComponent>[0]['Component'][];
  };
  const chat = getCachedFrogbot()?.config.chat;
  const navModel = buildNavModel({
    chatsSlug: chat?.enabled ? chat.chatsSlug : undefined,
    config: payload.config,
    i18n,
    permissions,
    visibleEntities,
  });
  const navPreferences = await getNavPreferences(req);
  const serverProps = { i18n, locale, params, payload, permissions, req, searchParams, user };
  const clientProps = { documentSubViewType, viewType };
  const render = (
    Component: Parameters<typeof RenderServerComponent>[0]['Component'],
    key?: string,
  ) =>
    RenderServerComponent({
      Component,
      clientProps,
      importMap: payload.importMap,
      key,
      serverProps,
    });
  const configuredItems = navModel.items.map((item) => ({
    ...item,
    icon:
      item.icon && (typeof item.icon !== 'string' || item.icon.includes('#'))
        ? RenderServerComponent({
            Component: item.icon,
            clientProps: { className: 'frogbot-admin-sidebar__icon', size: 24 },
            importMap: payload.importMap,
            serverProps,
          })
        : item.icon,
  }));
  const beforeNavLinks = admin.components.beforeNavLinks?.map((component, index) =>
    render(component, `before-nav-${index}`),
  );
  const afterNavLinks = admin.components.afterNavLinks?.map((component, index) =>
    render(component, `after-nav-${index}`),
  );
  const settings = Array.isArray(admin.components.settingsMenu)
    ? admin.components.settingsMenu.map((component, index) =>
        render(component, `settings-${index}`),
      )
    : [];
  const logout = admin.components.logout?.Button
    ? RenderServerComponent({
        Component: admin.components.logout.Button,
        clientProps,
        importMap: payload.importMap,
        serverProps,
      })
    : undefined;
  const accountUser = user as { email?: unknown; name?: unknown } | undefined;
  const accountEmail = typeof accountUser?.email === 'string' ? accountUser.email : undefined;
  const accountName = typeof accountUser?.name === 'string' ? accountUser.name : undefined;
  const logo = render(admin.components.graphics?.Icon);
  const homePath = formatAdminURL({ adminRoute: routes.admin, path: '' });
  const renderMany = (
    components: Parameters<typeof RenderServerComponent>[0]['Component'][] | undefined,
    key: string,
  ) => components?.map((component, index) => render(component, `${key}-${index}`));

  return (
    <FrogbotNavClient
      accountEmail={accountEmail}
      accountIcon={<Account />}
      accountName={accountName}
      accountPath={formatAdminURL({ adminRoute: routes.admin, path: admin.routes.account })}
      afterAccountMenu={
        <>
          {renderMany(shellComponents.afterAccountMenu, 'after-account-menu')}
          {settings}
        </>
      }
      afterBottomRail={renderMany(shellComponents.afterBottomRail, 'after-bottom-rail')}
      afterNavLinks={afterNavLinks}
      beforeAccountMenu={renderMany(shellComponents.beforeAccountMenu, 'before-account-menu')}
      beforeBottomRail={renderMany(shellComponents.beforeBottomRail, 'before-bottom-rail')}
      beforeNavLinks={beforeNavLinks}
      beforeSidebarClose={renderMany(shellComponents.beforeSidebarClose, 'before-sidebar-close')}
      homePath={homePath}
      initialOpen={navPreferences?.open}
      items={configuredItems}
      logo={logo}
      logout={logout}
      logoutPath={formatAdminURL({ adminRoute: routes.admin, path: admin.routes.logout })}
      sections={renderMany(shellComponents.navSections, 'nav-section')}
      settingsPath={formatAdminURL({ adminRoute: routes.admin, path: '/settings' })}
    />
  );
}
