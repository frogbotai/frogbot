'use client';

import type { ClientCollectionConfig, Column, PopulateType } from 'payload';
import type { ComponentType, KeyboardEvent, ReactNode } from 'react';

import { type CardRow, RecordCard } from '../cards/RecordCard.js';
import type { CardThumbnail } from '../cards/thumbnail.js';
import { useRecordPanel } from '../panel/RecordPanelProvider.client.js';
import { getUseAsDone, isRecordDone, recordClassName } from '../records/state.js';

/**
 * A gallery card: the shared card body, or the view's `Card`, in a card that opens the record
 * panel. It keeps its image area, with Payload's document icon when there is no image.
 */
export function GalleryDocumentCard({
  Card,
  canToggleDone,
  cardColumns,
  collectionConfig,
  collectionSlug,
  onToggled,
  populate,
  row,
  thumbnail,
}: {
  Card?: ComponentType<{ row: CardRow }>;
  canToggleDone: boolean;
  cardColumns: Column[];
  collectionConfig: ClientCollectionConfig;
  collectionSlug: string;
  onToggled: (row: CardRow) => void;
  populate?: PopulateType;
  row: CardRow;
  thumbnail: CardThumbnail;
}) {
  const panel = useRecordPanel();
  const selected = panel.openId === String(row.id);
  const done = isRecordDone(row, getUseAsDone(collectionConfig));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    panel.open(row.id);
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
        populate={populate}
        row={row}
        thumbnail={thumbnail}
        viewType="gallery"
      />
    );
  }

  return (
    <div
      className={`collection-gallery__card ${recordClassName({ done, selected })}`}
      onAuxClick={(event) => event.button === 1 && panel.open(row.id, event.nativeEvent)}
      onClick={(event) => panel.open(row.id, event.nativeEvent)}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
    >
      {body}
    </div>
  );
}
