import type { AdminViewServerProps, Column, ListQuery, Where } from 'payload';
import type { ReactNode } from 'react';

import {
  getActiveViewSlug,
  getRuntimeViews,
  redirectToLastView,
  type RuntimeCollectionView,
} from './collectionViews.js';
import { CollectionViewShellClient } from './CollectionViewShell.client.js';
import { buildFrameSlots } from './frame.js';
import { redirectRecordParam } from './panel/redirectRecord.js';
import { isQueryError, type StoredViewPreference } from './viewSetup.js';

type CollectionViewShellProps = AdminViewServerProps & {
  children: ReactNode;
  columnState?: Column[];
  enableSort?: boolean;
  keepViewWhenEmpty?: boolean;
  manualSortField?: string;
  preference?: StoredViewPreference;
  preferenceKey?: string;
  query?: ListQuery;
  showEmptyState?: boolean;
  view: RuntimeCollectionView;
  views: Array<{ label: string; path: string; slug: string; type: string }>;
};

/** Board, calendar and custom views in the shared frame, with Payload's list query around them. */
export async function CollectionViewShell(props: CollectionViewShellProps) {
  const { children, clientConfig, collectionConfig, collectionSlug, importMap, initPageResult } =
    props;

  if (!collectionConfig || !collectionSlug) return null;

  const { req } = initPageResult;
  const query = props.query ?? req.query ?? {};
  const view = props.view;

  redirectRecordParam({
    adminRoute: clientConfig.routes.admin,
    collectionConfig,
    record: query.record,
    redirect: props.server.redirect,
  });

  if (getActiveViewSlug(props) === undefined) {
    await redirectToLastView({ collectionSlug, req, server: props.server, views: props.views });
  }

  const permissions = initPageResult.permissions.collections?.[collectionSlug];
  const where = [view.filter, query.where].filter((value): value is Where => Boolean(value));

  const totalDocs =
    props.showEmptyState === false
      ? 1
      : await req.payload
          .count({
            collection: collectionSlug,
            overrideAccess: false,
            req,
            ...(where.length ? { where: where.length === 1 ? where[0] : { and: where } } : {}),
          })
          .then(
            (result) => result.totalDocs,
            (error: unknown) => {
              if (isQueryError(error)) return 0;
              throw error;
            },
          );

  const slots = buildFrameSlots({
    activeSlug: view.slug,
    adminRoute: clientConfig.routes.admin,
    collectionConfig,
    hasCreatePermission: Boolean(permissions?.create),
    hasDeletePermission: Boolean(permissions?.delete),
    i18n: req.i18n,
    importMap,
    runtime: getRuntimeViews(props),
    serverProps: props,
    view,
    views: props.views,
  });

  return (
    <CollectionViewShellClient
      {...slots}
      collectionSlug={collectionSlug}
      columnState={props.columnState}
      enableSort={props.enableSort}
      hasCreatePermission={Boolean(permissions?.create)}
      hasDeletePermission={Boolean(permissions?.delete)}
      isEmpty={totalDocs === 0}
      keepViewWhenEmpty={props.keepViewWhenEmpty}
      manualSortField={props.manualSortField}
      preference={props.preference}
      preferenceKey={props.preferenceKey}
      query={query}
      type={view.type}
    >
      {children}
    </CollectionViewShellClient>
  );
}
