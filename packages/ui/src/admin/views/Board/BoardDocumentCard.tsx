'use client';

import type { ClientCollectionConfig, Column, PopulateType } from 'payload';

import { BoardCard } from '../../../board/BoardCard.js';
import { type CardRow, RecordCard } from '../cards/RecordCard.js';
import type { CardThumbnail } from '../cards/thumbnail.js';
import { useRecordPanel } from '../panel/RecordPanelProvider.client.js';
import { getUseAsDone, isRecordDone, recordClassName } from '../records/state.js';

/** A document as the board holds it. */
export type BoardRow = CardRow;

/**
 * The built-in board card: the shared card body in a draggable card that opens the record panel.
 * A card with no image has no image area, so it stays compact.
 */
export function BoardDocumentCard({
  canToggleDone,
  cardColumns,
  collectionConfig,
  collectionSlug,
  disabled,
  onSave,
  populate,
  row,
  thumbnail,
}: {
  canToggleDone: boolean;
  cardColumns: Column[];
  collectionConfig: ClientCollectionConfig;
  collectionSlug: string;
  disabled: boolean;
  /** Called with the record the done toggle saved. */
  onSave: (row: BoardRow) => void;
  populate?: PopulateType;
  row: BoardRow;
  thumbnail: CardThumbnail;
}) {
  const panel = useRecordPanel();
  const selected = panel.openId === String(row.id);
  const done = isRecordDone(row, getUseAsDone(collectionConfig));

  return (
    <BoardCard
      className={recordClassName({ done, selected })}
      disabled={disabled}
      id={String(row.id)}
      onClick={(event) => panel.open(row.id, event?.nativeEvent)}
    >
      <RecordCard
        canToggleDone={canToggleDone}
        cardColumns={cardColumns}
        collectionConfig={collectionConfig}
        collectionSlug={collectionSlug}
        imageArea="when-set"
        onSave={onSave}
        populate={populate}
        row={row}
        thumbnail={thumbnail}
        viewType="board"
      />
    </BoardCard>
  );
}
