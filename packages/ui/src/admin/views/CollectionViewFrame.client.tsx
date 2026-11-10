'use client';

import './CollectionViewShell.css';
import './records/records.css';

import { getTranslation } from '@payloadcms/translations';
import { useConfig, usePathname, useStepNav, useTranslation } from '@payloadcms/ui';
import type { ViewTypes } from 'payload';
import { type ReactNode, useEffect, useRef } from 'react';

import { type ViewTab, ViewTabs } from '../elements/ViewTabs/index.client.js';
import { ViewControls, type ViewControlsProps } from './controls/ViewControls.client.js';
import { RecordPanel } from './panel/RecordPanel.client.js';
import { RecordPanelProvider, useRecordPanel } from './panel/RecordPanelProvider.client.js';
import { useRecordLinks } from './panel/useRecordLinks.js';

const baseClass = 'collection-view';

export type CollectionViewFrameProps = {
  AfterList?: ReactNode;
  AfterListTable?: ReactNode;
  BeforeList?: ReactNode;
  BeforeListTable?: ReactNode;
  children: ReactNode;
  collectionSlug: string;
  /** Payload list controls props the list view passes through, such as rendered filters. */
  controls?: Partial<ViewControlsProps>;
  Description?: ReactNode;
  enableColumns: boolean;
  enableSort?: boolean;
  /** Below the view, such as the list's page controls. */
  Footer?: ReactNode;
  hasCreateButton: boolean;
  hasCreatePermission: boolean;
  hasDeletePermission: boolean;
  /** In the header's action area, such as the list's selection. */
  HeaderActions?: ReactNode[];
  isEmpty: boolean;
  /** Keeps the view under its empty state instead of replacing it, as the calendar's grid. */
  keepViewWhenEmpty?: boolean;
  listMenuItems?: ReactNode[];
  manualSortField?: string;
  newDocumentURL: string;
  NoResults: ReactNode;
  tabs: ViewTab[];
  title?: string;
  /** Beside the title, such as the list's Bulk upload. */
  TitleActions?: ReactNode[];
  Toolbar?: ReactNode[];
  type: string;
  viewType?: ViewTypes;
};

/**
 * The one frame every collection view renders in: Payload's list header with the view tabs under
 * the title, Payload's list controls with the view's toolbar, the view's slots and its empty state.
 * It uses Payload's list markup, so each view's header and toolbar match the list's. Records open
 * in the record side panel beside it.
 */
export function CollectionViewFrame(props: CollectionViewFrameProps) {
  return (
    <RecordPanelProvider collectionSlug={props.collectionSlug}>
      <Frame {...props} />
    </RecordPanelProvider>
  );
}

function Frame(props: CollectionViewFrameProps) {
  const { i18n } = useTranslation();
  const { enabled, openId, state } = useRecordPanel();
  const mainRef = useRef<HTMLElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const panelOpen = state.mode !== 'closed';
  const { getEntityConfig } = useConfig();
  const { setStepNav } = useStepNav();
  const pathname = usePathname();

  const collectionConfig = getEntityConfig({ collectionSlug: props.collectionSlug });
  const pluralLabel = getTranslation(collectionConfig.labels.plural, i18n);
  const isTrash = props.viewType === 'trash';

  useEffect(() => {
    setStepNav(
      isTrash
        ? [{ label: pluralLabel, url: props.tabs[0]?.href }, { label: i18n.t('general:trash') }]
        : [{ label: pluralLabel }],
    );
  }, [i18n, isTrash, panelOpen, pathname, pluralLabel, props.tabs, setStepNav]);

  useRecordLinks({ collectionSlug: props.collectionSlug, disabled: isTrash, viewRef });

  const showView = !props.isEmpty || props.keepViewWhenEmpty;

  return (
    <>
      <main
        ref={mainRef}
        className={[
          'collection-list',
          `collection-list--${props.collectionSlug}`,
          baseClass,
          `${baseClass}--${props.type}`,
        ].join(' ')}
      >
        {props.BeforeList}
        <header className="list-header">
          <div className="list-header__content">
            <div className="list-header__title-and-actions">
              <h1 className="list-header__title">{props.title ?? pluralLabel}</h1>
              {props.TitleActions?.length ? (
                <div className="list-header__title-actions">{props.TitleActions}</div>
              ) : null}
            </div>
            {props.HeaderActions?.length ? (
              <div className="list-header__actions">{props.HeaderActions}</div>
            ) : null}
          </div>
          {props.Description || props.tabs.length > 1 ? (
            <div className="list-header__after-header-content">
              {props.Description ? (
                <div className="collection-list__sub-header">{props.Description}</div>
              ) : null}
              <ViewTabs collectionSlug={props.collectionSlug} tabs={props.tabs} />
            </div>
          ) : null}
        </header>
        <ViewControls
          beforeActions={props.Toolbar}
          collectionConfig={collectionConfig}
          collectionSlug={props.collectionSlug}
          enableColumns={props.enableColumns}
          enableSort={props.enableSort}
          hasCreatePermission={props.hasCreatePermission && !props.hasCreateButton && !isTrash}
          hasDeletePermission={props.hasDeletePermission}
          listMenuItems={props.listMenuItems?.length ? props.listMenuItems : undefined}
          manualSortField={props.manualSortField}
          newDocumentURL={props.newDocumentURL}
          viewType={props.viewType}
          {...props.controls}
        />
        {props.BeforeListTable}
        {props.isEmpty ? props.NoResults : null}
        {showView ? (
          <div
            className={`${baseClass}__view`}
            data-open-record={openId}
            data-record-panel={enabled ? '' : undefined}
            ref={viewRef}
          >
            {props.children}
          </div>
        ) : null}
        {props.AfterListTable}
        {props.AfterList}
        {props.Footer}
      </main>
      <RecordPanel viewRef={mainRef} />
    </>
  );
}
