'use client';

import './CollectionViewShell.css';

import { getTranslation } from '@payloadcms/translations';
import {
  ListHeader,
  ListQueryProvider,
  TableColumnsProvider,
  useConfig,
  useStepNav,
  useTranslation,
} from '@payloadcms/ui';
import { usePathname } from 'next/navigation.js';
import type { Column, ListQuery } from 'payload';
import { type ReactNode, useEffect } from 'react';

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
  manualSortField?: string;
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
  manualSortField,
  newDocumentURL,
  enableSort,
  query,
}: CollectionViewShellClientProps) {
  const { i18n } = useTranslation();
  const { getEntityConfig } = useConfig();
  const { setStepNav } = useStepNav();
  const pathname = usePathname();
  const collectionConfig = getEntityConfig({ collectionSlug });
  const pluralLabel = getTranslation(collectionConfig.labels.plural, i18n);
  const bulkUploadCompatibility = { openBulkUpload: () => undefined };

  useEffect(() => {
    setStepNav([{ label: pluralLabel }]);
  }, [pathname, pluralLabel, setStepNav]);

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
          enableGroupBy={false}
          listMenuItems={listMenuItems}
          enableSort={enableSort}
          manualSortField={manualSortField}
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
