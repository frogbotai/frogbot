'use client';

import { getTranslation } from '@payloadcms/translations';
import {
  ListSelection,
  PageControls,
  RelationshipProvider,
  SelectionProvider,
  TableColumnsProvider,
  useAuth,
  useConfig,
  useListDrawerContext,
  useListQuery,
  useTranslation,
  useWindowInfo,
} from '@payloadcms/ui';
import type { ListViewClientProps } from 'payload';
import { type ReactNode, useEffect, useRef } from 'react';

import type { ViewTab } from '../../elements/ViewTabs/index.client.js';
import { aiBulkMenuFields } from '../../fields/AI/bulk.js';
import { AIFieldListMenuItem } from '../../fields/AI/ListMenuItem.client.js';
import { CollectionViewFrame } from '../CollectionViewFrame.client.js';
import { BulkUploadButton } from './BulkUploadButton.client.js';
import { DefaultListView } from './DefaultListView.client.js';
import { ListSummary, type ListSummaryProps } from './summary/ListSummary.client.js';

/** The footer totals' setup, resolved on the server for the collection's list view. */
export type ListFrameSummary = Omit<ListSummaryProps, 'collectionSlug' | 'containerRef'>;

export type ListFrameClientProps = {
  AfterList?: ReactNode;
  AfterListTable?: ReactNode;
  BeforeList?: ReactNode;
  BeforeListTable?: ReactNode;
  Description?: ReactNode;
  /** The done records among the rows, found on the server from `admin.useAsDone`. */
  doneIds?: string[];
  hasCreateButton: boolean;
  isEmpty: boolean;
  listMenuItems?: ReactNode[];
  listProps: ListViewClientProps;
  newDocumentURL: string;
  NoResults: ReactNode;
  /** False when a grouped list shows every group on one page, hiding the group page controls. */
  pagedGroups?: boolean;
  summary?: ListFrameSummary;
  tabs: ViewTab[];
  Toolbar?: ReactNode[];
};

/**
 * Payload's list in the shared view frame: Payload's table, selection, bulk actions and page
 * controls, with FrogBot's header, tabs, toolbar and empty state around them.
 */
export function ListFrameClient({ listProps, ...frame }: ListFrameClientProps) {
  const { isInDrawer } = useListDrawerContext();

  if (isInDrawer) return <DefaultListView {...listProps} />;

  return <ListFrameInner {...frame} listProps={listProps} />;
}

function rowId(row: HTMLElement): string | undefined {
  return row.dataset.id ?? row.querySelector<HTMLElement>('[data-row-id]')?.dataset.rowId;
}

function useDoneRows(doneIds: string[] | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const key = doneIds?.join('\n') ?? '';

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const done = new Set(key ? key.split('\n') : []);

    const mark = () => {
      container
        .querySelectorAll<HTMLElement>('.table:not(.table--drag-preview) tbody > tr')
        .forEach((row) => {
          const id = rowId(row);
          row.toggleAttribute('data-done', id !== undefined && done.has(id));
        });
    };

    mark();
    const observer = new MutationObserver(mark);
    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [key]);

  return ref;
}

function ListFrameInner({
  doneIds,
  listProps,
  pagedGroups,
  summary,
  ...frame
}: ListFrameClientProps) {
  const { collectionSlug, columnState, disableBulkDelete, disableBulkEdit, Table, viewType } =
    listProps;

  const { getEntityConfig } = useConfig();
  const { permissions } = useAuth();
  const { i18n } = useTranslation();
  const { data, isGroupingBy } = useListQuery();
  const {
    breakpoints: { s: smallBreak },
  } = useWindowInfo();

  const collectionConfig = getEntityConfig({ collectionSlug });
  const label = getTranslation(collectionConfig.labels.plural, i18n);
  const docs = data?.docs ?? [];
  const upload = collectionConfig.upload;
  const canBulkUpload =
    listProps.hasCreatePermission &&
    viewType !== 'trash' &&
    Boolean(upload && upload.bulkUpload && !upload.hideFileInputOnCreate);

  const tableRef = useDoneRows(doneIds);
  const aiFields = aiBulkMenuFields({
    canUpdate: Boolean(permissions?.collections?.[collectionSlug]?.update),
    fields: collectionConfig.fields,
    isInDrawer: false,
    viewType,
  });

  const selection = (
    <ListSelection
      collectionConfig={collectionConfig}
      disableBulkDelete={disableBulkDelete}
      disableBulkEdit={disableBulkEdit}
      hasDeletePermission={listProps.hasDeletePermission}
      hasTrashPermission={listProps.hasTrashPermission}
      key="list-selection"
      label={label}
      showSelectAllAcrossPages={!isGroupingBy}
      viewType={viewType}
    />
  );

  const footer =
    docs.length > 0 && !isGroupingBy ? (
      <PageControls
        AfterPageControls={
          smallBreak ? <div className="collection-list__list-selection">{selection}</div> : null
        }
        collectionConfig={collectionConfig}
        tableId={`payload-table-${collectionSlug}`}
      />
    ) : docs.length > 0 && isGroupingBy && pagedGroups !== false && (data?.totalPages ?? 0) > 1 ? (
      <PageControls collectionConfig={collectionConfig} />
    ) : null;

  return (
    <TableColumnsProvider collectionSlug={collectionSlug} columnState={columnState}>
      <SelectionProvider docs={docs} totalDocs={data?.totalDocs ?? 0}>
        <CollectionViewFrame
          {...frame}
          collectionSlug={collectionSlug}
          controls={{
            disableQueryPresets:
              collectionConfig.enableQueryPresets !== true ||
              Boolean(listProps.disableQueryPresets),
            queryPreset: listProps.queryPreset,
            queryPresetPermissions: listProps.queryPresetPermissions,
            renderedFilters: listProps.renderedFilters,
            resolvedFilterOptions: listProps.resolvedFilterOptions,
          }}
          enableColumns
          Footer={footer}
          hasCreatePermission={listProps.hasCreatePermission}
          hasDeletePermission={Boolean(listProps.hasDeletePermission)}
          HeaderActions={!smallBreak && !isGroupingBy ? [selection] : undefined}
          TitleActions={
            canBulkUpload
              ? [<BulkUploadButton collectionSlug={collectionSlug} key="bulk" />]
              : undefined
          }
          listMenuItems={[
            ...(frame.listMenuItems ?? []),
            ...aiFields.map((field) => (
              <AIFieldListMenuItem
                collectionSlug={collectionSlug}
                field={field}
                key={`ai-bulk-${field.name}`}
              />
            )),
          ]}
          type="list"
          viewType={viewType}
        >
          <div ref={tableRef}>
            <RelationshipProvider>{Table}</RelationshipProvider>
          </div>
          {summary && !frame.isEmpty ? (
            <ListSummary {...summary} collectionSlug={collectionSlug} containerRef={tableRef} />
          ) : null}
        </CollectionViewFrame>
      </SelectionProvider>
    </TableColumnsProvider>
  );
}
