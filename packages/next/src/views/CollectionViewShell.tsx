import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { AdminViewServerProps, ListQuery, PayloadComponent } from 'payload';
import { formatAdminURL } from 'payload/shared';
import type { ReactNode } from 'react';

import { CollectionViewShellClient } from './CollectionViewShell.client.js';

type CollectionViewShellProps = AdminViewServerProps & {
  children: ReactNode;
  query?: ListQuery;
  viewComponents?: Record<string, PayloadComponent | PayloadComponent[]>;
  views: Array<{ label: string; path: string; slug: string; type: string }>;
  viewSlug: string;
};

export function CollectionViewShell(props: CollectionViewShellProps) {
  const {
    children,
    clientConfig,
    collectionConfig,
    collectionSlug,
    importMap,
    initPageResult,
    viewComponents,
  } = props;
  if (!collectionConfig || !collectionSlug) return null;

  const permissions = initPageResult.permissions.collections?.[collectionSlug];
  const clientProps = {
    collectionSlug,
    hasCreatePermission: Boolean(permissions?.create),
    hasDeletePermission: Boolean(permissions?.delete),
    newDocumentURL: formatAdminURL({
      adminRoute: clientConfig.routes.admin,
      path: `/collections/${collectionSlug}/create`,
    }),
  };
  const render = (Component?: PayloadComponent | PayloadComponent[]) =>
    Component
      ? RenderServerComponent({ Component, clientProps, importMap, serverProps: props })
      : undefined;
  const components = collectionConfig.admin.components;
  const listMenuItems = viewComponents?.menuItems
    ? [render(viewComponents.menuItems) as ReactNode]
    : undefined;

  return (
    <CollectionViewShellClient
      Actions={viewComponents?.actions ? [render(viewComponents.actions) as ReactNode] : undefined}
      AfterList={render(viewComponents?.afterView)}
      AfterListTable={render(viewComponents?.afterColumns)}
      BeforeList={render(viewComponents?.beforeView)}
      BeforeListTable={render(viewComponents?.beforeColumns)}
      collectionSlug={collectionSlug}
      Description={render(components?.Description)}
      hasCreatePermission={clientProps.hasCreatePermission}
      hasDeletePermission={clientProps.hasDeletePermission}
      listMenuItems={listMenuItems}
      newDocumentURL={clientProps.newDocumentURL}
      query={props.query ?? ((initPageResult.req.query ?? {}) as ListQuery)}
    >
      {children}
    </CollectionViewShellClient>
  );
}
