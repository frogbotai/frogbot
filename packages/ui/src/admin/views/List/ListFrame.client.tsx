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
  useRouter,
  useTranslation,
  useWindowInfo,
} from '@payloadcms/ui';
import type { ListViewClientProps } from 'payload';
import { type ReactNode, type RefObject, useEffect, useRef } from 'react';

import type { ViewTab } from '../../elements/ViewTabs/index.client.js';
import { aiBulkMenuFields } from '../../fields/AI/bulk.js';
import { AIFieldListMenuItem } from '../../fields/AI/ListMenuItem.client.js';
import { CollectionViewFrame } from '../CollectionViewFrame.client.js';
import { useRecordPanel, useRecordPanelEvents } from '../panel/RecordPanelProvider.client.js';
import { BulkUploadButton } from './BulkUploadButton.client.js';
import { CellEditing } from './cellEdit/CellEditing.client.js';
import { CellToggleProvider } from './cellEdit/CellToggle.client.js';
import { DefaultListView } from './DefaultListView.client.js';
import { ListGrid, ListGridProvider, type ListGridSettings } from './grid/ListGrid.client.js';
import { RowHeightControl } from './grid/RowHeightControl.client.js';
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
  /** The collection list's column widths and row height; absent in the trash. */
  grid?: ListGridSettings;
  /** The columns each row can edit, by row id, when that depends on the record. */
  editableCells?: Record<string, string[]>;
  /** The columns this person can edit in place, from the list view's `editable`. */
  editableColumns?: string[];
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

function useRecordRows(doneIds: string[] | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const key = doneIds?.join('\n') ?? '';
  const { openId } = useRecordPanel();

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
          row.toggleAttribute('data-selected', id !== undefined && id === openId);
        });
    };

    mark();
    const observer = new MutationObserver(mark);
    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [key, openId]);

  return ref;
}

function RecordRows({
  children,
  collectionSlug,
  doneIds,
  editableCells,
  editableColumns,
  footer,
}: {
  children: ReactNode;
  collectionSlug: string;
  doneIds?: string[];
  editableCells?: Record<string, string[]>;
  editableColumns?: string[];
  footer?: (containerRef: RefObject<HTMLDivElement | null>) => ReactNode;
}) {
  const ref = useRecordRows(doneIds);

  return (
    <>
      <div ref={ref}>
        {editableColumns?.length ? (
          <CellToggleProvider
            cells={editableCells}
            collectionSlug={collectionSlug}
            columns={editableColumns}
          >
            {children}
          </CellToggleProvider>
        ) : (
          children
        )}
      </div>
      {editableColumns?.length ? (
        <CellEditing
          cells={editableCells}
          collectionSlug={collectionSlug}
          columns={editableColumns}
          containerRef={ref}
        />
      ) : null}
      {footer?.(ref)}
    </>
  );
}

function RefreshOnPanelSave() {
  const router = useRouter();

  useRecordPanelEvents(() => router.refresh());

  return null;
}

function ListFrameInner({
  doneIds,
  grid,
  editableCells,
  editableColumns,
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

  const table = <RelationshipProvider>{Table}</RelationshipProvider>;

  const view = (
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
          Toolbar={
            grid ? [...(frame.Toolbar ?? []), <RowHeightControl key="row-height" />] : frame.Toolbar
          }
          type="list"
          viewType={viewType}
        >
          <RefreshOnPanelSave />
          <RecordRows
            collectionSlug={collectionSlug}
            doneIds={doneIds}
            editableCells={editableCells}
            editableColumns={editableColumns}
            footer={
              summary && !frame.isEmpty
                ? (containerRef) => (
                    <ListSummary
                      {...summary}
                      collectionSlug={collectionSlug}
                      containerRef={containerRef}
                    />
                  )
                : undefined
            }
          >
            {grid ? <ListGrid>{table}</ListGrid> : table}
          </RecordRows>
        </CollectionViewFrame>
      </SelectionProvider>
    </TableColumnsProvider>
  );

  return grid ? <ListGridProvider settings={grid}>{view}</ListGridProvider> : view;
}
