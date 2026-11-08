'use client';

import './CollectionViewShell.css';
import './records/records.css';

import { getTranslation } from '@payloadcms/translations';
import { useConfig, usePathname, useStepNav, useTranslation, useWindowInfo } from '@payloadcms/ui';
import type { ViewTypes } from 'payload';
import { type ReactNode, useEffect } from 'react';

import { type ViewTab, ViewTabs } from '../elements/ViewTabs/index.client.js';
import { ViewControls, type ViewControlsProps } from './controls/ViewControls.client.js';

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
  Toolbar?: ReactNode[];
  type: string;
  viewType?: ViewTypes;
};

/**
 * The one frame every collection view renders in: Payload's list header with the view tabs under
 * the title, Payload's list controls with the view's toolbar, the view's slots and its empty state.
 * It uses Payload's list markup, so each view's header and toolbar match the list's.
 */
export function CollectionViewFrame(props: CollectionViewFrameProps) {
  const { i18n } = useTranslation();
  const { getEntityConfig } = useConfig();
  const { setStepNav } = useStepNav();
  const pathname = usePathname();
  const {
    breakpoints: { s: smallBreak },
  } = useWindowInfo();

  const collectionConfig = getEntityConfig({ collectionSlug: props.collectionSlug });
  const pluralLabel = getTranslation(collectionConfig.labels.plural, i18n);
  const isTrash = props.viewType === 'trash';

  useEffect(() => {
    setStepNav(
      isTrash
        ? [{ label: pluralLabel, url: props.tabs[0]?.href }, { label: i18n.t('general:trash') }]
        : [{ label: pluralLabel }],
    );
  }, [i18n, isTrash, pathname, pluralLabel, props.tabs, setStepNav]);

  const showView = !props.isEmpty || props.keepViewWhenEmpty;

  return (
    <main
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
      {smallBreak && props.Toolbar ? (
        <div className={`${baseClass}__toolbar`}>{props.Toolbar}</div>
      ) : null}
      {props.BeforeListTable}
      {props.isEmpty ? props.NoResults : null}
      {showView ? <div className={`${baseClass}__view`}>{props.children}</div> : null}
      {props.AfterListTable}
      {props.AfterList}
      {props.Footer}
    </main>
  );
}
