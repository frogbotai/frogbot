import { getTranslation, type I18nClient } from '@payloadcms/translations';
import { Button, NoListResults, ViewDescription } from '@payloadcms/ui';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { ImportMap, PayloadComponent, SanitizedCollectionConfig, ViewTypes } from 'payload';
import { formatAdminURL } from 'payload/shared';
import type { ReactNode } from 'react';

import { renderNavIcon } from '../elements/Nav/renderNavIcon.js';
import type { ViewTab } from '../elements/ViewTabs/index.client.js';
import type { RuntimeCollectionView } from './collectionViews.js';
import { ResetViewMenuItem } from './ResetViewMenuItem.client.js';

/** A view's tab icon when it sets none. */
export const VIEW_TYPE_ICONS: Record<string, string> = {
  board: 'kanban',
  calendar: 'calendar',
  custom: 'dashboard',
  gallery: 'tile',
  list: 'list',
  table: 'table',
};

type ViewMetadata = { label: string; path: string; slug: string; type: string };

type SlotComponent = PayloadComponent | PayloadComponent[] | undefined;

export type FrameSlotsArgs = {
  activeSlug?: string;
  adminRoute: string;
  collectionConfig: SanitizedCollectionConfig;
  hasCreatePermission: boolean;
  hasDeletePermission: boolean;
  i18n: I18nClient;
  importMap: ImportMap;
  runtime: RuntimeCollectionView[];
  serverProps: object;
  view?: RuntimeCollectionView;
  views: ViewMetadata[];
  viewType?: ViewTypes;
};

/** The pieces of the shared view frame that every view type renders on the server. */
export type FrameSlots = {
  AfterList?: ReactNode;
  AfterListTable?: ReactNode;
  BeforeList?: ReactNode;
  BeforeListTable?: ReactNode;
  Description?: ReactNode;
  hasCreateButton: boolean;
  listMenuItems?: ReactNode[];
  newDocumentURL: string;
  NoResults: ReactNode;
  tabs: ViewTab[];
  Toolbar?: ReactNode[];
};

export function buildViewTabs({
  activeSlug,
  adminRoute,
  collectionConfig,
  i18n,
  importMap,
  runtime,
  serverProps,
  views,
  viewType,
}: FrameSlotsArgs): ViewTab[] {
  const slug = collectionConfig.slug;
  const href = (path: string) =>
    formatAdminURL({ adminRoute, path: `/collections/${slug}${path}` });

  const icon = (value: unknown) =>
    renderNavIcon({
      className: 'fb-view-tabs__icon',
      icon: value as string | undefined,
      importMap,
      serverProps,
      size: 16,
    });

  const isListPage = viewType !== 'trash' && viewType !== 'hierarchy';
  const tabs: ViewTab[] = views.map((view) => ({
    active: isListPage && view.slug === activeSlug,
    href: href(view.path),
    icon: icon(
      runtime.find(({ slug: key }) => key === view.slug)?.icon ?? VIEW_TYPE_ICONS[view.type],
    ),
    label: view.label,
    remember: true,
    slug: view.slug,
  }));

  if (collectionConfig.hierarchy) {
    tabs.push({
      active: viewType === 'hierarchy',
      href: `${href('')}?view=hierarchy`,
      icon: icon('folder'),
      label: `${i18n.t('general:by')} ${getTranslation(collectionConfig.labels.singular, i18n)}`,
      slug: 'hierarchy',
    });
  }

  if (collectionConfig.trash) {
    tabs.push({
      active: viewType === 'trash',
      href: href('/trash'),
      icon: icon('delete'),
      label: i18n.t('general:trash'),
      slug: 'trash',
    });
  }

  return tabs;
}

function slotsFor(view: RuntimeCollectionView | undefined) {
  const components = view?.components as Record<string, SlotComponent> | undefined;

  return {
    afterTable: components?.afterTable ?? components?.afterColumns ?? components?.afterCalendar,
    afterView: components?.afterView,
    beforeTable: components?.beforeTable ?? components?.beforeColumns ?? components?.beforeCalendar,
    beforeView: components?.beforeView,
    menuItems: components?.menuItems,
    NoResults: components?.NoResults,
    toolbar: components?.toolbar,
  };
}

/**
 * Renders the shared frame's slots for a view: tabs, description, toolbar, menu, the slots around
 * the view and its empty state. `skipLayoutSlots` leaves the slots around the view to the caller.
 */
export function buildFrameSlots(args: FrameSlotsArgs & { skipLayoutSlots?: boolean }): FrameSlots {
  const { collectionConfig, hasCreatePermission, hasDeletePermission, i18n, importMap } = args;
  const collectionSlug = collectionConfig.slug;
  const newDocumentURL = formatAdminURL({
    adminRoute: args.adminRoute,
    path: `/collections/${collectionSlug}/create`,
  });

  const clientProps = { collectionSlug, hasCreatePermission, hasDeletePermission, newDocumentURL };
  const render = (Component: SlotComponent) =>
    Component
      ? RenderServerComponent({ Component, clientProps, importMap, serverProps: args.serverProps })
      : undefined;

  const slots = slotsFor(args.view);
  const isTrash = args.viewType === 'trash';
  const CreateButton = isTrash
    ? undefined
    : (collectionConfig.admin.components as { CreateButton?: PayloadComponent } | undefined)
        ?.CreateButton;

  const createButton = (key: string) =>
    CreateButton ? (
      <div className="fb-create-button" key={key}>
        {render(CreateButton)}
      </div>
    ) : null;

  const toolbar = [
    ...(slots.toolbar ? [render(slots.toolbar)].flat() : []),
    ...(CreateButton ? [createButton('create-button')] : []),
  ];

  const description = collectionConfig.admin.description;
  const Description =
    render(collectionConfig.admin.components?.Description) ??
    (description && typeof description !== 'function' ? (
      <ViewDescription collectionSlug={collectionSlug} description={description} />
    ) : undefined);

  const label = getTranslation(collectionConfig.labels.singular, i18n);
  const NoResults =
    render(slots.NoResults) ??
    (isTrash ? (
      <NoListResults
        description={i18n.t('general:noTrashResults', {
          label: getTranslation(collectionConfig.labels.plural, i18n),
        })}
        withMargin
      />
    ) : (
      <NoListResults
        Actions={
          CreateButton
            ? [createButton('create')]
            : hasCreatePermission
              ? [
                  <Button el="link" key="create" to={newDocumentURL}>
                    {i18n.t('general:createNewLabel', { label })}
                  </Button>,
                ]
              : []
        }
        description={i18n.t('general:noResultsDescription')}
        title={i18n.t('general:noResultsFound')}
        withMargin
      />
    ));

  const menuItems = slots.menuItems ? [render(slots.menuItems)].flat() : [];

  return {
    ...(args.skipLayoutSlots
      ? {}
      : {
          AfterList: render(slots.afterView),
          AfterListTable: render(slots.afterTable),
          BeforeList: render(slots.beforeView),
          BeforeListTable: render(slots.beforeTable),
        }),
    Description,
    hasCreateButton: Boolean(CreateButton),
    listMenuItems: [
      ...menuItems,
      ...(args.view && args.view.type !== 'custom' && !isTrash
        ? [
            <ResetViewMenuItem
              collectionSlug={collectionSlug}
              key="reset-view"
              resetListPreference={args.view.type === 'list'}
              viewSlug={args.view.slug}
            />,
          ]
        : []),
    ],
    newDocumentURL,
    NoResults,
    tabs: buildViewTabs(args),
    Toolbar: toolbar.length ? toolbar : undefined,
  };
}
