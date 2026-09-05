import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { AdminViewServerProps, ListQuery, PayloadComponent } from 'payload';
import { formatAdminURL } from 'payload/shared';
import type { ReactNode } from 'react';

import { CollectionViewShellClient } from './CollectionViewShell.client.js';

type CollectionViewShellProps = AdminViewServerProps & {
  children: ReactNode;
  viewKey: string;
};

export function CollectionViewShell(props: CollectionViewShellProps) {
  const { children, clientConfig, collectionConfig, collectionSlug, importMap, initPageResult } =
    props;
  if (!collectionConfig || !collectionSlug) return null;

  const clientCollection = clientConfig.collections.find(({ slug }) => slug === collectionSlug);
  if (!clientCollection) return null;

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
  const listMenuItems = components?.listMenuItems
    ? [render(components.listMenuItems) as ReactNode]
    : undefined;

  return (
    <CollectionViewShellClient
      AfterList={render(components?.afterList)}
      AfterListTable={render(components?.afterListTable)}
      BeforeList={render(components?.beforeList)}
      BeforeListTable={render(components?.beforeListTable)}
      collectionConfig={clientCollection}
      Description={render(components?.Description)}
      hasCreatePermission={clientProps.hasCreatePermission}
      hasDeletePermission={clientProps.hasDeletePermission}
      i18n={initPageResult.req.i18n}
      listMenuItems={listMenuItems}
      newDocumentURL={clientProps.newDocumentURL}
      query={(initPageResult.req.query ?? {}) as ListQuery}
      viewKey={props.viewType ?? props.viewKey}
    >
      {children}
    </CollectionViewShellClient>
  );
}
