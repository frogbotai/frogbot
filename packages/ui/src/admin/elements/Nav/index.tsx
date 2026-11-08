import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { RootAdminComponents } from 'frogbot';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import type { NavPreferences, PayloadRequest, ServerProps } from 'payload';
import { formatAdminURL, PREFERENCE_KEYS } from 'payload/shared';
import type { ReactNode } from 'react';

import FolderIcon from '../../../icons/icons/FolderIcon.js';
import SettingIcon from '../../../icons/icons/SettingIcon.js';
import TileIcon from '../../../icons/icons/TileIcon.js';
import {
  getSettingsCollections,
  usesFrogBotSettings,
} from '../../views/Settings/resolveSection.js';
import { buildPaletteModel } from '../CommandPalette/buildPaletteModel.js';
import { buildSettingsNav } from '../SettingsNav/buildSettingsNav.js';
import { buildNavModel } from './buildNavModel.js';
import { FrogBotNavClient, FrogBotSettingsNavClient } from './index.client.js';
import { renderNavIcon } from './renderNavIcon.js';
import { resolveNavItems } from './resolveNavItems.js';

async function getNavPreferences(req?: PayloadRequest): Promise<NavPreferences | null> {
  if (!req?.user?.collection) return null;
  const result = await req.payload.find({
    collection: 'payload-preferences',
    depth: 0,
    limit: 1,
    overrideAccess: true,
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

export type FrogBotNavProps = {
  collectionSlug?: string;
  CustomAvatar?: ReactNode;
  docID?: number | string;
  req?: PayloadRequest;
} & ServerProps;

/** Whether the page belongs in FrogBot's Settings: a `/settings` page, Account, or a Settings collection. */
export function isSettingsPage({
  collectionSlug,
  config,
  params,
  viewType,
}: Pick<FrogBotNavProps, 'collectionSlug' | 'params' | 'viewType'> & {
  config: NonNullable<FrogBotNavProps['payload']>['config'];
}): boolean {
  if (!usesFrogBotSettings(config)) return false;

  const segments = params?.segments;
  const first = Array.isArray(segments) ? segments[0] : segments;

  return (
    first === 'settings' ||
    viewType === 'account' ||
    getSettingsCollections(config).some(({ slug }) => slug === collectionSlug)
  );
}

export async function FrogBotNav(props: FrogBotNavProps) {
  const {
    collectionSlug,
    CustomAvatar,
    docID,
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

  const frogbotReq = req ? attachRegisteredFrogBot(req) : undefined;

  const { admin, routes } = payload.config;
  const shellComponents = admin.components as typeof admin.components & RootAdminComponents;
  const navItems = await resolveNavItems({
    collectionSlug,
    config: payload.config,
    docID,
    importMap: payload.importMap,
    params,
    req: frogbotReq,
    viewType,
  });

  const modelProps = { config: payload.config, i18n, navItems, permissions, visibleEntities };
  const palette = buildPaletteModel(modelProps);

  const serverProps = {
    collectionSlug,
    docID,
    i18n,
    locale,
    params,
    payload,
    permissions,
    req,
    searchParams,
    user,
    visibleEntities,
  };

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

  const renderMany = (
    components: Parameters<typeof RenderServerComponent>[0]['Component'][] | undefined,
    key: string,
  ) => components?.map((component, index) => render(component, `${key}-${index}`));

  const settingsMenu = Array.isArray(admin.components.settingsMenu)
    ? admin.components.settingsMenu.map((component, index) =>
        render(component, `settings-${index}`),
      )
    : [];

  const accountMenu = {
    afterAccountMenu: (
      <>
        {renderMany(shellComponents.afterAccountMenu, 'after-account-menu')}
        {settingsMenu}
      </>
    ),
    beforeAccountMenu: renderMany(shellComponents.beforeAccountMenu, 'before-account-menu'),
    logout: admin.components.logout?.Button ? render(admin.components.logout.Button) : undefined,
    logoutPath: formatAdminURL({ adminRoute: routes.admin, path: admin.routes.logout }),
  };

  if (frogbotReq && isSettingsPage({ collectionSlug, config: payload.config, params, viewType })) {
    const navPreferences = await getNavPreferences(req);
    const settings = await buildSettingsNav({
      config: payload.config,
      permissions,
      req: frogbotReq,
      visibleEntities,
    });

    const fallbackIcons = {
      collection: <FolderIcon size={18} />,
      collections: <TileIcon size={18} />,
      entry: <SettingIcon size={18} />,
    };

    return (
      <FrogBotSettingsNavClient
        {...accountMenu}
        accountHref={settings.accountHref}
        backHref={settings.backHref}
        initialOpen={navPreferences?.open}
        items={settings.items.map(({ href, icon, kind, label }) => ({
          href,
          icon:
            renderNavIcon({ icon, importMap: payload.importMap, serverProps, size: 18 }) ??
            fallbackIcons[kind],
          label,
        }))}
        palette={palette}
      />
    );
  }

  const navModel = buildNavModel(modelProps);
  const navPreferences = await getNavPreferences(req);

  const configuredItems = navModel.items.map((item) => ({
    ...item,
    icon: renderNavIcon({
      className: 'fb-app-sidebar__icon',
      icon: item.icon,
      importMap: payload.importMap,
      serverProps,
      size: 24,
    }),
  }));

  const beforeNavLinks = admin.components.beforeNavLinks?.map((component, index) =>
    render(component, `before-nav-${index}`),
  );

  const afterNavLinks = admin.components.afterNavLinks?.map((component, index) =>
    render(component, `after-nav-${index}`),
  );

  const accountUser = user as { email?: unknown; name?: unknown } | undefined;
  const accountEmail = typeof accountUser?.email === 'string' ? accountUser.email : undefined;
  const accountName = typeof accountUser?.name === 'string' ? accountUser.name : undefined;
  const logo = render(admin.components.graphics?.Icon);
  const homePath = formatAdminURL({ adminRoute: routes.admin, path: '' });

  return (
    <FrogBotNavClient
      {...accountMenu}
      CustomAvatar={CustomAvatar}
      accountEmail={accountEmail}
      accountName={accountName}
      accountPath={formatAdminURL({ adminRoute: routes.admin, path: admin.routes.account })}
      afterBottomRail={renderMany(shellComponents.afterBottomRail, 'after-bottom-rail')}
      afterNavLinks={afterNavLinks}
      beforeBottomRail={renderMany(shellComponents.beforeBottomRail, 'before-bottom-rail')}
      beforeNavLinks={beforeNavLinks}
      beforeSidebarClose={renderMany(shellComponents.beforeSidebarClose, 'before-sidebar-close')}
      homePath={homePath}
      initialOpen={navPreferences?.open}
      items={configuredItems}
      logo={logo}
      palette={palette}
      sections={renderMany(shellComponents.navSections, 'nav-section')}
      settingsPath={formatAdminURL({ adminRoute: routes.admin, path: '/settings' })}
    />
  );
}
