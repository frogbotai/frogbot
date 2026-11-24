'use client';

import './RecordCard.css';

import { getTranslation } from '@payloadcms/translations';
import { DocumentIcon, useConfig, useTranslation } from '@payloadcms/ui';
import { formatDocTitle } from '@payloadcms/ui/shared';
import type { ClientCollectionConfig, ClientField, Column, PopulateType } from 'payload';

import { UserAvatar } from '../../../components/user-avatar.js';
import { FieldCell } from '../../fields/FieldCell/index.client.js';
import { isShortDate } from '../../fields/shortDate.js';
import { ShortDateCell } from '../../fields/ShortDateCell/index.client.js';
import { getPath } from '../cells.js';
import { DoneCheck } from '../records/DoneCheck.client.js';
import { getUseAsDone, isRecordDone } from '../records/state.js';
import { useToggleDone } from '../records/useRecordState.js';
import { type CardThumbnail, getCardThumbnailURL } from './thumbnail.js';

/** A document as a card view holds it. */
export type CardRow = Record<string, unknown> & { id: number | string };

export type RecordCardProps<TRow extends CardRow = CardRow> = {
  canToggleDone: boolean;
  cardColumns: Column[];
  collectionConfig: ClientCollectionConfig;
  collectionSlug: string;
  /**
   * `always` keeps the image area, with Payload's document icon when there is no image, so a grid
   * stays aligned. `when-set` draws it only for an image, so a board card stays compact.
   */
  imageArea: 'always' | 'when-set';
  onSave: (row: TRow) => void;
  /** Payload's `populate` for the image's upload, sent with the done toggle. */
  populate?: PopulateType;
  row: TRow;
  thumbnail: CardThumbnail;
  viewType: 'board' | 'gallery';
};

/**
 * The body every card view draws: image, done check, title and the chosen fields. Board and gallery
 * wrap it in their own card, which handles dragging, the drawer and selection.
 */
export function RecordCard<TRow extends CardRow>({
  canToggleDone,
  cardColumns,
  collectionConfig,
  collectionSlug,
  imageArea,
  onSave,
  populate,
  row,
  thumbnail,
  viewType,
}: RecordCardProps<TRow>) {
  const useAsDone = getUseAsDone(collectionConfig);
  const done = isRecordDone(row, useAsDone);
  const { saving, toggle } = useToggleDone<TRow>({
    collectionSlug,
    onSaved: onSave,
    populate,
    useAsDone,
  });

  const { i18n } = useTranslation();
  const {
    config: {
      admin: { dateFormat, user: userSlug },
    },
  } = useConfig();

  const title = formatDocTitle({ collectionConfig, data: row, dateFormat, i18n });
  const src = getCardThumbnailURL(row, thumbnail);
  const showImage = thumbnail !== false && (Boolean(src) || imageArea === 'always');

  return (
    <>
      {showImage ? (
        <div
          className={`fb-card__image${thumbnail && thumbnail.fit === 'contain' ? ' fb-card__image--contain' : ''}`}
        >
          {src ? <img alt="" src={src} /> : <DocumentIcon />}
        </div>
      ) : null}
      <div className="fb-card__heading">
        {useAsDone ? (
          <DoneCheck
            disabled={!canToggleDone || saving}
            done={done}
            onToggle={(next) => void toggle(row, next)}
          />
        ) : null}
        <div className="fb-card__title">{title}</div>
      </div>
      {viewType === 'board' ? (
        <BoardMeta
          cardColumns={cardColumns}
          collectionSlug={collectionSlug}
          row={row}
          userSlug={userSlug}
        />
      ) : (
        cardColumns.map(({ accessor, field }) => (
          <div className="fb-card__field" key={accessor}>
            <span className="fb-card__field-label">
              {getTranslation(('label' in field ? field.label : undefined) || accessor, i18n)}
            </span>
            <div className="fb-card__field-value">
              <FieldCell
                cellData={getPath(row, accessor)}
                collectionSlug={collectionSlug}
                field={field}
                link={false}
                rowData={row}
                viewType={viewType}
              />
            </div>
          </div>
        ))
      )}
    </>
  );
}

function isEmpty(value: unknown): boolean {
  return (
    value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)
  );
}

type UserDoc = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asUser(field: ClientField, value: unknown, userSlug: string): UserDoc | undefined {
  if (field.type !== 'relationship' || field.relationTo !== userSlug || field.hasMany) {
    return undefined;
  }

  return value && typeof value === 'object' ? (value as UserDoc) : undefined;
}

function BoardMeta<TRow extends CardRow>({
  cardColumns,
  collectionSlug,
  row,
  userSlug,
}: {
  cardColumns: Column[];
  collectionSlug: string;
  row: TRow;
  userSlug: string;
}) {
  const { getEntityConfig } = useConfig();
  const userTitle = getEntityConfig({ collectionSlug: userSlug })?.admin?.useAsTitle || 'email';
  const facts = cardColumns.filter(({ accessor }) => !isEmpty(getPath(row, accessor)));

  if (!facts.length) return null;

  return (
    <div className="fb-card__meta">
      {facts.map(({ accessor, field }) => {
        const value = getPath(row, accessor);
        const user = asUser(field, value, userSlug);

        if (user) {
          const name = text(user[userTitle]);
          const email = text(user.email);
          const label = name ?? email ?? String(user.id ?? '');

          return (
            <span
              aria-label={label}
              className="fb-card__avatar"
              data-field={accessor}
              key={accessor}
              title={label}
            >
              <UserAvatar email={email} name={name} size={20} />
            </span>
          );
        }

        const Cell = isShortDate(field) ? ShortDateCell : FieldCell;

        return (
          <span className="fb-card__fact" data-field={accessor} key={accessor}>
            <Cell
              cellData={value}
              collectionSlug={collectionSlug}
              field={field}
              link={false}
              rowData={row}
              viewType="board"
            />
          </span>
        );
      })}
    </div>
  );
}
