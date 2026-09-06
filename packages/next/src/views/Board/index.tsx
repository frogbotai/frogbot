import './BoardView.css';

import type { FrogbotRequest } from 'frogbot';
import { notFound } from 'next/navigation';
import type { AdminViewServerProps, Field } from 'payload';
import { getFromImportMap } from 'payload/shared';
import type { ComponentType } from 'react';

import { getActiveViewSlug, resolveCollectionViews } from '../collectionViews.js';
import { CollectionViewShell } from '../CollectionViewShell.js';
import { BoardPreference } from './BoardPreference.client.js';
import { BoardViewClient } from './BoardView.client.js';
import { getBoardGroupBy, getBoardPreferenceKey, resolveBoardGroupBy } from './data.js';
import { resolveBoardField, resolveColumns } from './resolveColumns.js';

export async function BoardView(props: AdminViewServerProps) {
  const { collectionConfig, collectionSlug, importMap, initPageResult, payload } = props;
  if (!collectionConfig || !collectionSlug) return null;
  const { runtime, views } = await resolveCollectionViews(props);
  const activeSlug = getActiveViewSlug(props) ?? runtime[0]?.slug;
  const board = runtime.find(
    ({ slug }) => slug === activeSlug && views.some((item) => item.slug === slug),
  );
  if (!board || board.type !== 'board') notFound();
  const query = (initPageResult.req.query ?? {}) as { groupBy?: unknown };
  const hasQueryGroupBy = Object.prototype.hasOwnProperty.call(query, 'groupBy');
  const queryGroupBy = typeof query.groupBy === 'string' ? query.groupBy : undefined;
  const preferenceKey = getBoardPreferenceKey(collectionSlug, board.slug);
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
  const preferenceValue = preference?.docs[0]?.value as { groupBy?: unknown } | undefined;
  const preferenceGroupBy =
    typeof preferenceValue?.groupBy === 'string' ? preferenceValue.groupBy : undefined;
  const selectedGroupBy = resolveBoardGroupBy({
    configuredGroupBy: board.groupBy,
    hasQueryGroupBy,
    preferenceGroupBy,
    queryGroupBy,
  });
  const groupBy = getBoardGroupBy(selectedGroupBy);
  const initialQuery = {
    ...(initPageResult.req.query ?? {}),
    groupBy: selectedGroupBy,
  };
  if (!groupBy) {
    return (
      <CollectionViewShell
        {...props}
        query={initialQuery}
        viewComponents={board.components}
        views={views}
        viewSlug={board.slug}
      >
        <BoardPreference
          collectionSlug={collectionSlug}
          groupBy={hasQueryGroupBy ? selectedGroupBy : undefined}
          viewSlug={board.slug}
        />
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
  const fields = board.defaultFields ?? [collectionConfig.admin.useAsTitle ?? 'id'];
  const filter =
    typeof board.filter === 'function'
      ? await board.filter({ req: initPageResult.req as unknown as FrogbotRequest })
      : board.filter;
  const permissions = initPageResult.permissions.collections?.[collectionSlug] as any;
  const fieldPermission = groupBy
    .split('.')
    .reduce<any>((value, key) => value?.fields?.[key] ?? value?.[key], permissions);
  const resolve = (component: unknown) =>
    component
      ? getFromImportMap<ComponentType<any>>({
          importMap,
          PayloadComponent: component as never,
          schemaPath: '',
        })
      : undefined;
  return (
    <CollectionViewShell
      {...props}
      query={initialQuery}
      viewComponents={board.components}
      views={views}
      viewSlug={board.slug}
    >
      <BoardPreference
        collectionSlug={collectionSlug}
        groupBy={hasQueryGroupBy ? selectedGroupBy : undefined}
        viewSlug={board.slug}
      />
      <BoardViewClient
        cardFields={fields}
        collectionSlug={collectionSlug}
        columns={columns}
        cover={board.cover}
        filter={filter}
        groupBy={groupBy}
        limit={board.pagination?.defaultLimit ?? 50}
        sort={board.defaultSort}
        canUpdate={Boolean(permissions?.update && fieldPermission?.update !== false)}
        Card={resolve(board.components?.Card)}
        ColumnHeader={resolve(board.components?.ColumnHeader)}
      />
    </CollectionViewShell>
  );
}
