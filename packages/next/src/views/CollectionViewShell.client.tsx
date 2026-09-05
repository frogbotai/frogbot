'use client';

import './CollectionViewShell.css';

import { ListControls, ListHeader, ListQueryProvider } from '@payloadcms/ui';
import type { ClientCollectionConfig, ListQuery } from 'payload';
import type { ReactNode } from 'react';

import { ViewSwitcher } from '../elements/ViewSwitcher/index.client.js';

export type CollectionViewShellClientProps = {
  BeforeList?: ReactNode;
  BeforeListTable?: ReactNode;
  AfterListTable?: ReactNode;
  AfterList?: ReactNode;
  Description?: ReactNode;
  children: ReactNode;
  collectionConfig: ClientCollectionConfig;
  hasCreatePermission: boolean;
  hasDeletePermission: boolean;
  i18n: Parameters<typeof ListHeader>[0]['i18n'];
  listMenuItems?: ReactNode[];
  newDocumentURL: string;
  query: ListQuery;
  viewKey: string;
};

export function CollectionViewShellClient({
  AfterList,
  AfterListTable,
  BeforeList,
  BeforeListTable,
  children,
  collectionConfig,
  Description,
  hasCreatePermission,
  hasDeletePermission,
  i18n,
  listMenuItems,
  newDocumentURL,
  query,
  viewKey,
}: CollectionViewShellClientProps) {
  return (
    <ListQueryProvider
      collectionSlug={collectionConfig.slug}
      data={undefined}
      modifySearchParams
      query={query}
    >
      <div className={`collection-view-shell collection-view-shell--${collectionConfig.slug}`}>
        {BeforeList}
        <div className="collection-view-shell__content">
          <ListHeader
            collectionConfig={collectionConfig}
            Description={Description}
            hasCreatePermission={hasCreatePermission}
            hasDeletePermission={hasDeletePermission}
            i18n={i18n}
            isBulkUploadEnabled={false}
            newDocumentURL={newDocumentURL}
            openBulkUpload={() => undefined}
            smallBreak={false}
            viewType={viewKey}
          />
          <ViewSwitcher collectionSlug={collectionConfig.slug} viewType={viewKey} />
          <ListControls
            collectionConfig={collectionConfig}
            collectionSlug={collectionConfig.slug}
            listMenuItems={listMenuItems}
          />
          {BeforeListTable}
          <div className="collection-view-shell__view">{children}</div>
          {AfterListTable}
        </div>
        {AfterList}
      </div>
    </ListQueryProvider>
  );
}
