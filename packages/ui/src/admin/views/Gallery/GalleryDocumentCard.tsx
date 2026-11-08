'use client';

import { useDocumentDrawer } from '@payloadcms/ui';
import type { ClientCollectionConfig, Column } from 'payload';
import type { ComponentType, KeyboardEvent, ReactNode } from 'react';

import { type CardRow, RecordCard } from '../cards/RecordCard.js';
import type { CardThumbnail } from '../cards/thumbnail.js';
import { getUseAsDone, isRecordDone, recordClassName } from '../records/state.js';
import { useDrawerSelected } from '../records/useRecordState.js';

/**
 * A gallery card: the shared card body, or the view's `Card`, in a card that opens the document
 * drawer. It keeps its image area, with Payload's document icon when there is no image.
 */
export function GalleryDocumentCard({
  Card,
  canToggleDone,
  cardColumns,
  collectionConfig,
  collectionSlug,
  onDelete,
  onSave,
  onToggled,
  row,
  thumbnail,
}: {
  Card?: ComponentType<{ row: CardRow }>;
  canToggleDone: boolean;
  cardColumns: Column[];
  collectionConfig: ClientCollectionConfig;
  collectionSlug: string;
  onDelete: (row: CardRow) => void;
  onSave: (row: CardRow) => void;
  onToggled: (row: CardRow) => void;
  row: CardRow;
  thumbnail: CardThumbnail;
}) {
  const [DocumentDrawer, , drawer] = useDocumentDrawer({ collectionSlug, id: String(row.id) });
  const selected = useDrawerSelected(drawer.drawerSlug);
  const done = isRecordDone(row, getUseAsDone(collectionConfig));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    drawer.openDrawer();
  };

  let body: ReactNode;

  if (Card) {
    body = <Card row={row} />;
  } else {
    body = (
      <RecordCard
        canToggleDone={canToggleDone}
        cardColumns={cardColumns}
        collectionConfig={collectionConfig}
        collectionSlug={collectionSlug}
        imageArea="always"
        onSave={onToggled}
        row={row}
        thumbnail={thumbnail}
        viewType="gallery"
      />
    );
  }

  return (
    <>
      <div
        className={`collection-gallery__card ${recordClassName({ done, selected })}`}
        onClick={drawer.openDrawer}
        onKeyDown={onKeyDown}
        role="button"
        tabIndex={0}
      >
        {body}
      </div>
      <DocumentDrawer onDelete={() => onDelete(row)} onSave={({ doc }) => onSave(doc)} />
    </>
  );
}
