'use client';

import './CollectionViewShell.css';

import {
  ListHeader,
  ListQueryProvider,
  TableColumnsProvider,
  useConfig,
  useTranslation,
} from '@payloadcms/ui';
import type { Column, ListQuery } from 'payload';
import type { ReactNode } from 'react';

import { ViewControls } from './controls/ViewControls.client.js';

export type CollectionViewShellClientProps = {
  Actions?: ReactNode[];
  BeforeList?: ReactNode;
  BeforeListTable?: ReactNode;
  AfterListTable?: ReactNode;
  AfterList?: ReactNode;
  Description?: ReactNode;
  enableSort?: boolean;
  children: ReactNode;
  collectionSlug: string;
  columnState?: Column[];
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
  columnState,
  Description,
  hasCreatePermission,
  hasDeletePermission,
  listMenuItems,
  newDocumentURL,
  enableSort,
  query,
}: CollectionViewShellClientProps) {
  const { i18n } = useTranslation();
  const { getEntityConfig } = useConfig();
  const collectionConfig = getEntityConfig({ collectionSlug });
  const bulkUploadCompatibility = { openBulkUpload: () => undefined };

  const shell = (
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
        <ViewControls
          collectionConfig={collectionConfig}
          collectionSlug={collectionConfig.slug}
          enableColumns={Boolean(columnState)}
          listMenuItems={listMenuItems}
          enableSort={enableSort}
        />
        {BeforeListTable}
        <div className="collection-view-shell__view">{children}</div>
        {AfterListTable}
      </div>
      {AfterList}
    </div>
  );

  return (
    <ListQueryProvider
      collectionSlug={collectionConfig.slug}
      data={undefined}
      modifySearchParams
      query={query}
    >
      {columnState ? (
        <TableColumnsProvider collectionSlug={collectionConfig.slug} columnState={columnState}>
          {shell}
        </TableColumnsProvider>
      ) : (
        shell
      )}
    </ListQueryProvider>
  );
}
