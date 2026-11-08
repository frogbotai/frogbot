'use client';

import { useDocumentDrawer } from '@payloadcms/ui';
import type { ClientCollectionConfig, Column } from 'payload';

import { BoardCard } from '../../../board/BoardCard.js';
import { type CardRow, RecordCard } from '../cards/RecordCard.js';
import type { CardThumbnail } from '../cards/thumbnail.js';
import { getUseAsDone, isRecordDone, recordClassName } from '../records/state.js';
import { useDrawerSelected } from '../records/useRecordState.js';

/** A document as the board holds it. */
export type BoardRow = CardRow;

/**
 * The built-in board card: the shared card body in a draggable card that opens the document
 * drawer. A card with no image has no image area, so it stays compact.
 */
export function BoardDocumentCard({
  canToggleDone,
  cardColumns,
  collectionConfig,
  collectionSlug,
  disabled,
  onDelete,
  onSave,
  row,
  thumbnail,
}: {
  canToggleDone: boolean;
  cardColumns: Column[];
  collectionConfig: ClientCollectionConfig;
  collectionSlug: string;
  disabled: boolean;
  onDelete: (row: BoardRow) => void;
  onSave: (row: BoardRow) => void;
  row: BoardRow;
  thumbnail: CardThumbnail;
}) {
  const [DocumentDrawer, , drawer] = useDocumentDrawer({ collectionSlug, id: String(row.id) });
  const selected = useDrawerSelected(drawer.drawerSlug);
  const done = isRecordDone(row, getUseAsDone(collectionConfig));

  return (
    <>
      <BoardCard
        className={recordClassName({ done, selected })}
        disabled={disabled}
        id={String(row.id)}
        onClick={drawer.openDrawer}
      >
        <RecordCard
          canToggleDone={canToggleDone}
          cardColumns={cardColumns}
          collectionConfig={collectionConfig}
          collectionSlug={collectionSlug}
          imageArea="when-set"
          onSave={onSave}
          row={row}
          thumbnail={thumbnail}
          viewType="board"
        />
      </BoardCard>
      <DocumentDrawer onDelete={() => onDelete(row)} onSave={({ doc }) => onSave(doc)} />
    </>
  );
}
