'use client';

import './CollectionViewShell.css';

import {
  ListControls,
  ListHeader,
  ListQueryProvider,
  useConfig,
  useTranslation,
} from '@payloadcms/ui';
import type { ListQuery } from 'payload';
import type { ReactNode } from 'react';

export type CollectionViewShellClientProps = {
  Actions?: ReactNode[];
  BeforeList?: ReactNode;
  BeforeListTable?: ReactNode;
  AfterListTable?: ReactNode;
  AfterList?: ReactNode;
  Description?: ReactNode;
  children: ReactNode;
  collectionSlug: string;
  hasCreatePermission: boolean;
  hasDeletePermission: boolean;
  listMenuItems?: ReactNode[];
  newDocumentURL: string;
  query: ListQuery;
};

export function CollectionViewShellClient({
  Actions,
  AfterList,
  AfterListTable,
  BeforeList,
  BeforeListTable,
  children,
  collectionSlug,
  Description,
  hasCreatePermission,
  hasDeletePermission,
  listMenuItems,
  newDocumentURL,
  query,
}: CollectionViewShellClientProps) {
  const { i18n } = useTranslation();
  const { getEntityConfig } = useConfig();
  const collectionConfig = getEntityConfig({ collectionSlug });
  const bulkUploadCompatibility = { openBulkUpload: () => undefined };

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
            smallBreak
            {...bulkUploadCompatibility}
          />
          {Actions}
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
