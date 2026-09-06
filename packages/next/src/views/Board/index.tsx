import './BoardView.css';

import { getColumns, renderTable } from '@payloadcms/ui/rsc';
import type { FrogbotRequest } from 'frogbot';
import { notFound } from 'next/navigation';
import type { AdminViewServerProps, Field, SanitizedFieldPermissions } from 'payload';
import { getFromImportMap, transformColumnsToSearchParams } from 'payload/shared';
import type { ComponentType } from 'react';

import { getActiveViewSlug, resolveCollectionViews } from '../collectionViews.js';
import { CollectionViewShell } from '../CollectionViewShell.js';
import {
  getViewPreferenceKey,
  resolveViewColumnPreferences,
  type ViewColumnsSource,
} from '../preferences.js';
import { BoardPreference } from './BoardPreference.client.js';
import { BoardViewClient, type BoardViewClientProps } from './BoardView.client.js';
import {
  type BoardPreferenceValue,
  getBoardGroupBy,
  resolveBoardGroupBy,
  resolveBoardSort,
} from './data.js';
import { resolveBoardField, resolveColumns } from './resolveColumns.js';

export async function BoardView(props: AdminViewServerProps) {
  const { clientConfig, collectionConfig, collectionSlug, importMap, initPageResult, payload } =
    props;
  if (!collectionConfig || !collectionSlug) return null;
  const { runtime, views } = await resolveCollectionViews(props);
  const activeSlug = getActiveViewSlug(props) ?? runtime[0]?.slug;
  const board = runtime.find(
    ({ slug }) => slug === activeSlug && views.some((item) => item.slug === slug),
  );
  if (!board || board.type !== 'board') notFound();
  const orderField = views.find(({ slug }) => slug === board.slug)?.orderField;
  if (!orderField) notFound();
  const query = (initPageResult.req.query ?? {}) as {
    columns?: unknown;
    groupBy?: unknown;
    sort?: unknown;
  };
  const hasQueryGroupBy = Object.prototype.hasOwnProperty.call(query, 'groupBy');
  const queryGroupBy = typeof query.groupBy === 'string' ? query.groupBy : undefined;
  const querySort =
    typeof query.sort === 'string' ||
    (Array.isArray(query.sort) && query.sort.every((value) => typeof value === 'string'))
      ? (query.sort as string | string[])
      : Object.prototype.hasOwnProperty.call(query, 'sort')
        ? ''
        : undefined;
  const queryColumns: ViewColumnsSource =
    typeof query.columns === 'string' ||
    (Array.isArray(query.columns) && query.columns.every((value) => typeof value === 'string'))
      ? (query.columns as string | string[])
      : undefined;
  const preferenceKey = getViewPreferenceKey(collectionSlug, board.slug);
  const preference = initPageResult.req.user
    ? await payload.find({
        collection: 'payload-preferences',
        depth: 0,
        limit: 1,
        pagination: false,
        req: initPageResult.req,
        where: {
          and: [
            { key: { equals: preferenceKey } },
            { 'user.relationTo': { equals: initPageResult.req.user.collection } },
            { 'user.value': { equals: initPageResult.req.user.id } },
          ],
        },
      })
    : undefined;
  const preferenceValue = preference?.docs[0]?.value as BoardPreferenceValue | undefined;
  const preferenceGroupBy =
    typeof preferenceValue?.groupBy === 'string' ? preferenceValue.groupBy : undefined;
  const preferenceSort =
    typeof preferenceValue?.sort === 'string' ? preferenceValue.sort : undefined;
  const selectedGroupBy = resolveBoardGroupBy({
    configuredGroupBy: board.groupBy,
    hasQueryGroupBy,
    preferenceGroupBy,
    queryGroupBy,
  });
  const selectedSort = resolveBoardSort({
    defaultSort: board.defaultSort,
    orderField,
    preferenceSort,
    querySort,
  });
  const groupBy = getBoardGroupBy(selectedGroupBy);
  const permissions = initPageResult.permissions.collections?.[collectionSlug];
  const clientCollectionConfig = clientConfig.collections.find(
    ({ slug }) => slug === collectionSlug,
  );
  const columnPreferences = resolveViewColumnPreferences({
    defaultFields: board.defaultFields,
    preferenceColumns: Array.isArray(preferenceValue?.columns)
      ? preferenceValue.columns
      : undefined,
    queryColumns,
    useAsTitle: collectionConfig.admin.useAsTitle,
  });
  const cardColumns = getColumns({
    clientConfig,
    collectionConfig: clientCollectionConfig,
    collectionSlug,
    columns: columnPreferences,
    i18n: initPageResult.req.i18n,
    permissions: initPageResult.permissions,
  });
  const { columnState } = renderTable({
    clientCollectionConfig,
    collectionConfig,
    columns: cardColumns,
    enableRowSelections: false,
    fieldPermissions: permissions?.fields,
    i18n: initPageResult.req.i18n,
    orderableFieldName: '',
    payload,
    req: initPageResult.req,
    useAsTitle: collectionConfig.admin.useAsTitle,
  });
  const { queryByGroup: _queryByGroup, ...restQuery } = initPageResult.req.query ?? {};
  const initialQuery = {
    ...restQuery,
    columns: transformColumnsToSearchParams(cardColumns),
    groupBy: selectedGroupBy,
    sort: selectedSort,
  };
  const preferenceWriter = (
    <BoardPreference
      collectionSlug={collectionSlug}
      columns={queryColumns ? cardColumns : undefined}
      groupBy={hasQueryGroupBy ? selectedGroupBy : undefined}
      sort={Array.isArray(querySort) ? querySort.join(',') : querySort}
      viewSlug={board.slug}
    />
  );
  if (!groupBy) {
    return (
      <CollectionViewShell
        {...props}
        columnState={columnState}
        query={initialQuery}
        enableSort
        manualSortField={orderField}
        viewComponents={board.components}
        views={views}
        viewSlug={board.slug}
      >
        {preferenceWriter}
        <div className="collection-board__empty">Choose a group field to use this board.</div>
      </CollectionViewShell>
    );
  }
  const groupField = resolveBoardField(collectionConfig.fields as Field[], groupBy);
  if (!groupField) notFound();
  const columns = await resolveColumns({
    collectionSlug,
    field: groupField,
    path: groupBy,
    req: initPageResult.req,
  });
  const filter =
    typeof board.filter === 'function'
      ? await board.filter({ req: initPageResult.req as unknown as FrogbotRequest })
      : board.filter;
  let fieldPermission: SanitizedFieldPermissions | undefined;
  let fieldPermissions = permissions?.fields;
  for (const key of groupBy.split('.')) {
    if (!fieldPermissions || fieldPermissions === true) {
      fieldPermission = fieldPermissions;
      break;
    }
    fieldPermission = fieldPermissions[key];
    fieldPermissions = fieldPermission === true ? true : fieldPermission?.fields;
  }
  const resolve = <TProps extends object>(component: unknown) =>
    component
      ? getFromImportMap<ComponentType<TProps>>({
          importMap,
          PayloadComponent: component as never,
          schemaPath: '',
        })
      : undefined;
  return (
    <CollectionViewShell
      {...props}
      columnState={columnState}
      query={initialQuery}
      enableSort
      manualSortField={orderField}
      viewComponents={board.components}
      views={views}
      viewSlug={board.slug}
    >
      {preferenceWriter}
      <BoardViewClient
        collectionSlug={collectionSlug}
        columns={columns}
        cover={board.cover}
        filter={filter}
        groupBy={groupBy}
        limit={board.pagination?.defaultLimit ?? 50}
        orderField={orderField}
        canUpdate={Boolean(
          permissions?.update &&
          (fieldPermission === true || (fieldPermission && fieldPermission.update)),
        )}
        Card={resolve<
          NonNullable<BoardViewClientProps['Card']> extends ComponentType<infer P> ? P : never
        >(board.components?.Card)}
        ColumnHeader={resolve<
          NonNullable<BoardViewClientProps['ColumnHeader']> extends ComponentType<infer P>
            ? P
            : never
        >(board.components?.ColumnHeader)}
      />
    </CollectionViewShell>
  );
}
