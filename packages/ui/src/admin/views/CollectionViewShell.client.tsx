'use client';

import './CollectionViewShell.css';

import { getTranslation } from '@payloadcms/translations';
import {
  ListHeader,
  ListQueryProvider,
  TableColumnsProvider,
  useConfig,
  usePathname,
  useStepNav,
  useTranslation,
  useWindowInfo,
} from '@payloadcms/ui';
import type { Column, ListQuery } from 'payload';
import { type ReactNode, useEffect } from 'react';

import { ViewControls } from './controls/ViewControls.client.js';

export type CollectionViewShellClientProps = {
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
  Toolbar?: ReactNode[];
};

export function CollectionViewShellClient({
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
  Toolbar,
}: CollectionViewShellClientProps) {
  const { i18n } = useTranslation();
  const { getEntityConfig } = useConfig();
  const { setStepNav } = useStepNav();
  const pathname = usePathname();
  const {
    breakpoints: { s: smallBreak },
  } = useWindowInfo();

  const collectionConfig = getEntityConfig({ collectionSlug });
  const pluralLabel = getTranslation(collectionConfig.labels.plural, i18n);

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
        />
        <ViewControls
          beforeActions={Toolbar}
          collectionConfig={collectionConfig}
          collectionSlug={collectionConfig.slug}
          enableColumns={Boolean(columnState)}
          listMenuItems={listMenuItems}
          enableSort={enableSort}
          manualSortField={manualSortField}
        />
        {smallBreak && Toolbar ? (
          <div className="collection-view-shell__toolbar">{Toolbar}</div>
        ) : null}
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
