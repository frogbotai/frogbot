'use client';

import { getTranslation } from '@payloadcms/translations';
import { useConfig, useDocumentDrawer, useTranslation } from '@payloadcms/ui';
import { formatDocTitle } from '@payloadcms/ui/shared';
import type { ClientCollectionConfig, Column } from 'payload';

import { BoardCard } from '../../../board/BoardCard.js';
import { FieldCell } from '../../fields/FieldCell/index.client.js';
import { getPath } from '../cells.js';

/** A document as the board holds it. */
export type BoardRow = Record<string, unknown> & { id: number | string };

/** The built-in board card: cover, title and the chosen fields, opening the document drawer. */
export function BoardDocumentCard({
  cardColumns,
  collectionConfig,
  collectionSlug,
  cover,
  disabled,
  onDelete,
  onSave,
  row,
}: {
  cardColumns: Column[];
  collectionConfig: ClientCollectionConfig;
  collectionSlug: string;
  cover?: string;
  disabled: boolean;
  onDelete: (row: BoardRow) => void;
  onSave: (row: BoardRow) => void;
  row: BoardRow;
}) {
  const [DocumentDrawer, , drawer] = useDocumentDrawer({ collectionSlug, id: String(row.id) });
  const { i18n } = useTranslation();
  const {
    config: {
      admin: { dateFormat },
    },
  } = useConfig();

  const title = formatDocTitle({
    collectionConfig,
    data: row,
    dateFormat,
    i18n,
  });

  return (
    <>
      <BoardCard disabled={disabled} id={String(row.id)} onClick={drawer.openDrawer}>
        {cover ? (
          <img
            alt=""
            className="collection-board__cover"
            src={String((getPath(row, cover) as { url?: unknown } | undefined)?.url ?? '')}
          />
        ) : null}
        <div className="collection-board__title">{title}</div>
        {cardColumns.map(({ accessor, field }) => (
          <div className="collection-board__field" key={accessor}>
            <span className="collection-board__field-label">
              {getTranslation(('label' in field ? field.label : undefined) || accessor, i18n)}
            </span>
            <div className="collection-board__field-value">
              <FieldCell
                cellData={getPath(row, accessor)}
                collectionSlug={collectionSlug}
                field={field}
                link={false}
                rowData={row}
                viewType="board"
              />
            </div>
          </div>
        ))}
      </BoardCard>
      <DocumentDrawer onDelete={() => onDelete(row)} onSave={({ doc }) => onSave(doc)} />
    </>
  );
}
