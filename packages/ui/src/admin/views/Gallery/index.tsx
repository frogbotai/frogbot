import { getColumns, renderTable } from '@payloadcms/ui/rsc';
import type { AdminViewServerProps, PaginatedDocs, PayloadComponent, Where } from 'payload';
import {
  combineWhereConstraints,
  getFromImportMap,
  mergeListSearchAndWhere,
  transformColumnsToSearchParams,
} from 'payload/shared';
import type { ComponentType } from 'react';

import { getCardThumbnailPopulate, resolveCardThumbnail } from '../cards/thumbnail.js';
import { getActiveViewSlug, resolveCollectionViews, withPageProps } from '../collectionViews.js';
import { CollectionViewShell } from '../CollectionViewShell.js';
import { canUpdateField } from '../fieldPermissions.js';
import { resolveViewColumnPreferences, type ViewColumnsSource } from '../preferences.js';
import { isQueryError, resolveViewSetup } from '../viewSetup.js';
import {
  GalleryPageControls,
  GalleryViewClient,
  type GalleryViewClientProps,
} from './GalleryView.client.js';

const DEFAULT_LIMIT = 25;

function toNumber(value: unknown): number | undefined {
  const number = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;

  return Number.isInteger(number) && number > 0 ? number : undefined;
}

/**
 * A grid of cards, one page per request like Payload's own grid: the board's card body, image and
 * fields, without dragging.
 */
export async function GalleryView(input: AdminViewServerProps) {
  const props = await withPageProps(input);
  const { clientConfig, collectionConfig, collectionSlug, importMap, initPageResult, payload } =
    props;

  if (!collectionConfig || !collectionSlug) return null;
  const { runtime, views } = await resolveCollectionViews(props);
  const activeSlug = getActiveViewSlug(props) ?? runtime[0]?.slug;
  const gallery = runtime.find(
    ({ slug }) => slug === activeSlug && views.some((item) => item.slug === slug),
  );

  if (!gallery || gallery.type !== 'gallery') return props.server.notFound();
  const { req } = initPageResult;
  const defaultLimit = gallery.pagination?.defaultLimit ?? DEFAULT_LIMIT;
  const setup = await resolveViewSetup({
    collectionSlug,
    defaultLimit,
    query: req.query ?? {},
    req,
    viewSlug: gallery.slug,
  });

  const query = setup.query as Record<string, unknown>;
  const queryColumns =
    typeof query.columns === 'string' || Array.isArray(query.columns)
      ? (query.columns as ViewColumnsSource)
      : undefined;

  const limit = toNumber(query.limit) ?? defaultLimit;
  const page = toNumber(query.page) ?? 1;
  const sort =
    typeof query.sort === 'string' ||
    (Array.isArray(query.sort) && query.sort.every((value) => typeof value === 'string'))
      ? query.sort
      : gallery.defaultSort;

  const permissions = initPageResult.permissions.collections?.[collectionSlug];
  const clientCollectionConfig = clientConfig.collections.find(
    ({ slug }) => slug === collectionSlug,
  );

  const cardColumns = getColumns({
    clientConfig,
    collectionConfig: clientCollectionConfig,
    collectionSlug,
    columns: resolveViewColumnPreferences({
      defaultFields: gallery.defaultFields,
      queryColumns,
      useAsTitle: collectionConfig.admin.useAsTitle,
    }),
    i18n: req.i18n,
    permissions: initPageResult.permissions,
  });

  const { columnState } = renderTable({
    clientCollectionConfig,
    collectionConfig,
    columns: cardColumns,
    enableRowSelections: false,
    fieldPermissions: permissions?.fields,
    i18n: req.i18n,
    orderableFieldName: '',
    payload,
    req,
    useAsTitle: collectionConfig.admin.useAsTitle,
  });

  const thumbnail = resolveCardThumbnail({ collectionConfig, view: gallery });
  const populate = getCardThumbnailPopulate({
    collectionConfig,
    collections: payload.config.collections,
    thumbnail,
  });

  const where = mergeListSearchAndWhere({
    collectionConfig,
    search: typeof query.search === 'string' ? query.search : '',
    where: combineWhereConstraints([gallery.filter, query.where as Where | undefined]),
  });

  const data: PaginatedDocs<GalleryViewClientProps['docs'][number]> = await payload
    .find({
      collection: collectionSlug,
      depth: 1,
      limit,
      overrideAccess: false,
      page,
      populate,
      req,
      sort,
      where,
    })
    .catch((error: unknown) => {
      if (!isQueryError(error)) throw error;

      return {
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit,
        page: 1,
        pagingCounter: 1,
        totalDocs: 0,
        totalPages: 1,
      };
    });

  const useAsDone = (collectionConfig.admin.custom?.frogbot as { useAsDone?: string } | undefined)
    ?.useAsDone;

  const Card = gallery.components?.Card
    ? getFromImportMap<NonNullable<GalleryViewClientProps['Card']>>({
        importMap,
        PayloadComponent: gallery.components.Card as PayloadComponent,
        schemaPath: '',
      })
    : undefined;

  return (
    <CollectionViewShell
      {...props}
      columnState={columnState}
      data={data}
      enableSort
      Footer={<GalleryPageControls limits={gallery.pagination?.limits} />}
      preference={setup.preference}
      preferenceKey={setup.preferenceKey}
      query={{
        ...setup.query,
        columns: transformColumnsToSearchParams(cardColumns),
        limit,
        page,
        ...(sort ? { sort } : {}),
      }}
      totalDocs={data.docs.length ? data.totalDocs : 0}
      view={gallery}
      views={views}
    >
      <GalleryViewClient
        Card={Card as ComponentType<{ row: GalleryViewClientProps['docs'][number] }> | undefined}
        canToggleDone={Boolean(
          permissions?.update && useAsDone && canUpdateField(permissions.fields, useAsDone),
        )}
        collectionSlug={collectionSlug}
        docs={data.docs}
        populate={populate}
        thumbnail={thumbnail}
      />
    </CollectionViewShell>
  );
}
