import './BoardView.css';

import { getColumns, renderTable } from '@payloadcms/ui/rsc';
import type { AdminViewServerProps, PayloadComponent } from 'payload';
import { getFromImportMap, transformColumnsToSearchParams } from 'payload/shared';
import type { ComponentType } from 'react';

import { getCardThumbnailPopulate, resolveCardThumbnail } from '../cards/thumbnail.js';
import { getActiveViewSlug, resolveCollectionViews, withPageProps } from '../collectionViews.js';
import { CollectionViewShell } from '../CollectionViewShell.js';
import { canUpdateField } from '../fieldPermissions.js';
import { resolveViewColumnPreferences, type ViewColumnsSource } from '../preferences.js';
import { resolveViewSetup } from '../viewSetup.js';
import { BoardViewClient, type BoardViewClientProps } from './BoardView.client.js';
import {
  type BoardPreferenceValue,
  getBoardColumnState,
  getBoardGroupBy,
  resolveBoardGroupBy,
  resolveBoardSort,
} from './data.js';
import { getInlineAdd } from './inlineAdd.js';
import { resolveBoardField, resolveColumns } from './resolveColumns.js';

export async function BoardView(input: AdminViewServerProps) {
  const props = await withPageProps(input);
  const { clientConfig, collectionConfig, collectionSlug, importMap, initPageResult, payload } =
    props;

  if (!collectionConfig || !collectionSlug) return null;
  const { runtime, views } = await resolveCollectionViews(props);
  const activeSlug = getActiveViewSlug(props) ?? runtime[0]?.slug;
  const board = runtime.find(
    ({ slug }) => slug === activeSlug && views.some((item) => item.slug === slug),
  );

  if (!board || board.type !== 'board') return props.server.notFound();
  const orderField = views.find(({ slug }) => slug === board.slug)?.orderField;
  if (!orderField) return props.server.notFound();
  const setup = await resolveViewSetup({
    collectionSlug,
    query: initPageResult.req.query ?? {},
    req: initPageResult.req,
    viewSlug: board.slug,
  });

  const query = setup.query as { columns?: unknown; groupBy?: unknown; sort?: unknown };
  const hasQueryGroupBy = Object.prototype.hasOwnProperty.call(query, 'groupBy');
  const queryGroupBy = typeof query.groupBy === 'string' ? query.groupBy : undefined;
  const querySort =
    typeof query.sort === 'string' ||
    (Array.isArray(query.sort) && query.sort.every((value) => typeof value === 'string'))
      ? query.sort
      : undefined;

  const queryColumns =
    typeof query.columns === 'string' || Array.isArray(query.columns)
      ? (query.columns as ViewColumnsSource)
      : undefined;

  const preferenceValue = setup.preference as BoardPreferenceValue | undefined;

  const selectedGroupBy = resolveBoardGroupBy({
    configuredGroupBy: board.groupBy,
    hasQueryGroupBy,
    queryGroupBy,
  });

  const selectedSort = resolveBoardSort({
    defaultSort: board.defaultSort,
    orderField,
    querySort,
    viewSlug: board.slug,
  });

  const groupBy = getBoardGroupBy(selectedGroupBy);
  const permissions = initPageResult.permissions.collections?.[collectionSlug];
  const clientCollectionConfig = clientConfig.collections.find(
    ({ slug }) => slug === collectionSlug,
  );

  const columnPreferences = resolveViewColumnPreferences({
    defaultFields: board.defaultFields,
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

  const { queryByGroup: _queryByGroup, ...restQuery } = setup.query;
  const initialQuery = {
    ...restQuery,
    columns: transformColumnsToSearchParams(cardColumns),
    groupBy: selectedGroupBy,
    sort: selectedSort,
  };

  if (!groupBy) {
    return (
      <CollectionViewShell
        {...props}
        columnState={columnState}
        query={initialQuery}
        enableSort
        manualSortField={orderField}
        preference={setup.preference}
        preferenceKey={setup.preferenceKey}
        view={board}
        views={views}
      >
        <div className="collection-board__empty">Choose a group field to use this board.</div>
      </CollectionViewShell>
    );
  }

  const useAsDone = (collectionConfig.admin.custom?.frogbot as { useAsDone?: string } | undefined)
    ?.useAsDone;

  const groupField = resolveBoardField(collectionConfig.fields, groupBy);
  if (!groupField) return props.server.notFound();
  const columns = await resolveColumns({
    collectionSlug,
    field: groupField,
    path: groupBy,
    req: initPageResult.req,
  });

  const thumbnail = resolveCardThumbnail({ collectionConfig, view: board });

  const resolve = <TProps extends object>(component: PayloadComponent | undefined) =>
    component
      ? getFromImportMap<ComponentType<TProps>>({
          importMap,
          PayloadComponent: component,
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
      preference={setup.preference}
      preferenceKey={setup.preferenceKey}
      showEmptyState={Boolean(setup.query.where || setup.query.search)}
      view={board}
      views={views}
    >
      <BoardViewClient
        collectionSlug={collectionSlug}
        columnState={getBoardColumnState(preferenceValue)}
        columns={columns}
        filter={board.filter}
        groupBy={groupBy}
        limit={board.pagination?.defaultLimit ?? 50}
        orderField={orderField}
        populate={getCardThumbnailPopulate({
          collectionConfig,
          collections: payload.config.collections,
          thumbnail,
        })}
        thumbnail={thumbnail}
        viewSlug={board.slug}
        canCreate={Boolean(permissions?.create)}
        canToggleDone={Boolean(
          permissions?.update && useAsDone && canUpdateField(permissions.fields, useAsDone),
        )}
        inlineAdd={getInlineAdd({ collectionConfig, groupBy, permissions })}
        canUpdate={Boolean(permissions?.update && canUpdateField(permissions.fields, groupBy))}
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
