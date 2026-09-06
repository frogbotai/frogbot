'use client';

import './DefaultListView.css';

import { getTranslation } from '@payloadcms/translations';
import {
  Button,
  Gutter,
  ListHeader,
  ListSelection,
  PageControls,
  RelationshipProvider,
  RenderCustomComponent,
  SelectionProvider,
  SelectMany,
  StickyToolbar,
  TableColumnsProvider,
  useBulkUpload,
  useConfig,
  useControllableState,
  useListDrawerContext,
  useListQuery,
  useModal,
  useStepNav,
  useTranslation,
  useWindowInfo,
  ViewDescription,
} from '@payloadcms/ui';
import { useRouter } from 'next/navigation.js';
import type { ListViewClientProps } from 'payload';
import { formatAdminURL, formatFilesize } from 'payload/shared';
import React, { Fragment, useEffect } from 'react';

import { ViewControls } from '../controls/ViewControls.client.js';

const baseClass = 'collection-list';

function NoListResults({
  Actions,
  Message,
}: {
  Actions?: React.ReactNode[];
  Message: React.ReactNode;
}) {
  return (
    <div className="no-results">
      {Message}
      {Actions && Actions.length > 0 && (
        <div className="no-results__actions">
          {Actions.map((action, index) => (
            <Fragment key={index}>{action}</Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export const DefaultListView: React.FC<ListViewClientProps> = (props) => {
  const {
    AfterList,
    AfterListTable,
    beforeActions,
    BeforeList,
    BeforeListTable,
    collectionSlug,
    columnState,
    Description,
    disableBulkDelete,
    disableBulkEdit,
    disableQueryPresets,
    enableRowSelections,
    hasCreatePermission: hasCreatePermissionFromProps,
    hasDeletePermission,
    hasTrashPermission,
    listMenuItems,
    newDocumentURL,
    queryPreset,
    queryPresetPermissions,
    renderedFilters,
    resolvedFilterOptions,
    Table: InitialTable,
    viewType,
  } = props;

  const [Table] = useControllableState(InitialTable);

  const { allowCreate, createNewDrawerSlug, isInDrawer, onBulkSelect } = useListDrawerContext();

  const hasCreatePermission =
    allowCreate !== undefined
      ? allowCreate && hasCreatePermissionFromProps
      : hasCreatePermissionFromProps;

  const {
    config: {
      routes: { admin: adminRoute },
      serverURL,
    },
    getEntityConfig,
  } = useConfig();
  const router = useRouter();

  const { data, isGroupingBy } = useListQuery();

  const { openModal } = useModal();
  const { drawerSlug: bulkUploadDrawerSlug, setCollectionSlug, setOnSuccess } = useBulkUpload();

  const collectionConfig = getEntityConfig({ collectionSlug });
  const listView = (
    collectionConfig.admin.custom?.frogbot as
      { views?: Array<{ groupBy?: boolean; type: string }> } | undefined
  )?.views?.find((view) => view.type === 'list');

  const { labels, upload } = collectionConfig;

  const isUploadCollection = Boolean(upload);

  const isBulkUploadEnabled = Boolean(upload && upload.bulkUpload);

  const isTrashEnabled = Boolean(collectionConfig.trash);

  const { i18n } = useTranslation();

  const { setStepNav } = useStepNav();

  const {
    breakpoints: { s: smallBreak },
  } = useWindowInfo();

  const docs = React.useMemo(() => {
    if (isUploadCollection) {
      return (data?.docs ?? []).map((doc) => {
        return {
          ...doc,
          filesize: typeof doc.filesize === 'number' ? formatFilesize(doc.filesize) : doc.filesize,
        };
      });
    } else {
      return data?.docs ?? [];
    }
  }, [data?.docs, isUploadCollection]);

  const openBulkUpload = React.useCallback(() => {
    setCollectionSlug(collectionSlug);
    openModal(bulkUploadDrawerSlug);
    setOnSuccess(() => router.refresh());
  }, [router, collectionSlug, bulkUploadDrawerSlug, openModal, setCollectionSlug, setOnSuccess]);

  useEffect(() => {
    if (!isInDrawer) {
      const baseLabel = {
        label: getTranslation(labels?.plural, i18n),
        url:
          isTrashEnabled && viewType === 'trash'
            ? formatAdminURL({
                adminRoute,
                path: `/collections/${collectionSlug}`,
              })
            : undefined,
      };

      const trashLabel = {
        label: i18n.t('general:trash'),
      };

      const navItems =
        isTrashEnabled && viewType === 'trash' ? [baseLabel, trashLabel] : [baseLabel];

      setStepNav(navItems);
    }
  }, [
    adminRoute,
    setStepNav,
    serverURL,
    labels,
    isInDrawer,
    isTrashEnabled,
    viewType,
    i18n,
    collectionSlug,
  ]);

  return (
    <Fragment>
      <TableColumnsProvider collectionSlug={collectionSlug} columnState={columnState}>
        <div className={`${baseClass} ${baseClass}--${collectionSlug}`}>
          <SelectionProvider docs={docs} totalDocs={data?.totalDocs ?? 0}>
            {BeforeList}
            <Gutter className={`${baseClass}__wrap`}>
              <ListHeader
                collectionConfig={collectionConfig}
                Description={
                  Description || collectionConfig?.admin?.description ? (
                    <div className={`${baseClass}__sub-header`}>
                      <RenderCustomComponent
                        CustomComponent={Description}
                        Fallback={
                          <ViewDescription
                            collectionSlug={collectionSlug}
                            description={collectionConfig?.admin?.description ?? ''}
                          />
                        }
                      />
                    </div>
                  ) : undefined
                }
                disableBulkDelete={disableBulkDelete}
                disableBulkEdit={disableBulkEdit}
                hasCreatePermission={hasCreatePermission}
                hasDeletePermission={hasDeletePermission}
                hasTrashPermission={hasTrashPermission}
                i18n={i18n}
                isBulkUploadEnabled={Boolean(
                  isBulkUploadEnabled && upload && !upload.hideFileInputOnCreate,
                )}
                isTrashEnabled={isTrashEnabled}
                newDocumentURL={newDocumentURL}
                openBulkUpload={openBulkUpload}
                smallBreak={smallBreak}
                viewType={viewType}
              />
              <ViewControls
                beforeActions={
                  enableRowSelections && typeof onBulkSelect === 'function'
                    ? beforeActions
                      ? [...beforeActions, <SelectMany key="select-many" onClick={onBulkSelect} />]
                      : [<SelectMany key="select-many" onClick={onBulkSelect} />]
                    : beforeActions
                }
                collectionConfig={collectionConfig}
                collectionSlug={collectionSlug}
                disableQueryPresets={
                  collectionConfig?.enableQueryPresets !== true || disableQueryPresets
                }
                enableSort
                enableGroupBy={listView?.groupBy !== false}
                listMenuItems={listMenuItems}
                queryPreset={queryPreset}
                queryPresetPermissions={queryPresetPermissions}
                renderedFilters={renderedFilters}
                resolvedFilterOptions={resolvedFilterOptions}
              />
              {BeforeListTable}
              {docs?.length > 0 && (
                <div className={`${baseClass}__tables`}>
                  <RelationshipProvider>{Table}</RelationshipProvider>
                </div>
              )}
              {docs?.length === 0 && (
                <NoListResults
                  Actions={
                    hasCreatePermission && newDocumentURL && viewType !== 'trash'
                      ? [
                          isInDrawer && createNewDrawerSlug ? (
                            <Button
                              el="button"
                              key="create"
                              onClick={() => openModal(createNewDrawerSlug)}
                            >
                              {i18n.t('general:createNewLabel', {
                                label: getTranslation(labels?.singular, i18n),
                              })}
                            </Button>
                          ) : (
                            <Button el="link" key="create" to={newDocumentURL}>
                              {i18n.t('general:createNewLabel', {
                                label: getTranslation(labels?.singular, i18n),
                              })}
                            </Button>
                          ),
                        ]
                      : []
                  }
                  Message={
                    viewType === 'trash' ? (
                      <p>
                        {i18n.t('general:noTrashResults', {
                          label: getTranslation(labels?.plural, i18n),
                        })}
                      </p>
                    ) : (
                      <>
                        <h3>{i18n.t('general:noResultsFound')}</h3>
                        <p>{i18n.t('general:noResultsDescription')}</p>
                      </>
                    )
                  }
                />
              )}
              {AfterListTable}
              {docs?.length > 0 && !isGroupingBy && (
                <PageControls
                  AfterPageControls={
                    smallBreak ? (
                      <div className={`${baseClass}__list-selection`}>
                        <ListSelection
                          collectionConfig={collectionConfig}
                          disableBulkDelete={disableBulkDelete}
                          disableBulkEdit={disableBulkEdit}
                          label={getTranslation(collectionConfig.labels.plural, i18n)}
                          showSelectAllAcrossPages={!isGroupingBy}
                        />
                        <div className={`${baseClass}__list-selection-actions`}>
                          {enableRowSelections && typeof onBulkSelect === 'function'
                            ? beforeActions
                              ? [
                                  ...beforeActions,
                                  <SelectMany key="select-many" onClick={onBulkSelect} />,
                                ]
                              : [<SelectMany key="select-many" onClick={onBulkSelect} />]
                            : beforeActions}
                        </div>
                      </div>
                    ) : null
                  }
                  collectionConfig={collectionConfig}
                />
              )}
            </Gutter>
            {AfterList}
          </SelectionProvider>
        </div>
      </TableColumnsProvider>
      {docs.length > 0 && isGroupingBy && (data?.totalPages ?? 0) > 1 && (
        <StickyToolbar>
          <PageControls collectionConfig={collectionConfig} />
        </StickyToolbar>
      )}
    </Fragment>
  );
};
