'use client';

import './GalleryView.css';

import { getTranslation } from '@payloadcms/translations';
import {
  CardGrid,
  PageControlsComponent,
  RelationshipProvider,
  useConfig,
  useListQuery,
  useRouter,
  useTableColumns,
  useTranslation,
} from '@payloadcms/ui';
import { type ComponentType, useEffect, useMemo, useState } from 'react';

import type { CardRow } from '../cards/RecordCard.js';
import type { CardThumbnail } from '../cards/thumbnail.js';
import { getViewCardColumns } from '../preferences.js';
import { GalleryDocumentCard } from './GalleryDocumentCard.js';

export type GalleryViewClientProps = {
  Card?: ComponentType<{ row: CardRow }>;
  canToggleDone: boolean;
  collectionSlug: string;
  docs: CardRow[];
  thumbnail: CardThumbnail;
};

/** The gallery's grid: one card per document on the current page. */
export function GalleryViewClient({
  Card,
  canToggleDone,
  collectionSlug,
  docs,
  thumbnail,
}: GalleryViewClientProps) {
  const router = useRouter();
  const { i18n } = useTranslation();
  const { getEntityConfig } = useConfig();
  const { columns: columnState } = useTableColumns();
  const collectionConfig = getEntityConfig({ collectionSlug });
  const useAsTitle = collectionConfig.admin?.useAsTitle;
  const cardColumns = useMemo(
    () => getViewCardColumns(columnState, useAsTitle),
    [columnState, useAsTitle],
  );

  const [rows, setRows] = useState(docs);

  useEffect(() => setRows(docs), [docs]);

  const replace = (doc: CardRow) =>
    setRows((current) => current.map((row) => (row.id === doc.id ? doc : row)));

  return (
    <RelationshipProvider>
      <CardGrid
        ariaLabel={getTranslation(collectionConfig.labels.plural, i18n)}
        className="collection-gallery"
        getKey={(row) => String(row.id)}
        items={rows}
        renderItem={(row) => (
          <GalleryDocumentCard
            Card={Card}
            canToggleDone={canToggleDone}
            cardColumns={cardColumns}
            collectionConfig={collectionConfig}
            collectionSlug={collectionSlug}
            onDelete={() => router.refresh()}
            onSave={() => router.refresh()}
            onToggled={replace}
            row={row}
            thumbnail={thumbnail}
          />
        )}
      />
    </RelationshipProvider>
  );
}

/** The gallery's page controls, with the view's own page sizes. */
export function GalleryPageControls({ limits }: { limits?: number[] }) {
  const { data, handlePageChange, handlePerPageChange, query } = useListQuery();

  if (!data?.docs.length) return null;

  return (
    <PageControlsComponent
      data={data}
      handlePageChange={handlePageChange}
      handlePerPageChange={handlePerPageChange}
      limit={Number(query.limit) || data.limit}
      limits={limits}
    />
  );
}
