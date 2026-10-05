'use client';

import './index.css';

import { StarIcon } from '@frogbotai/ui/icons';
import { getTranslation } from '@payloadcms/translations';
import { DefaultCell, useField, useTranslation, withCondition } from '@payloadcms/ui';
import type { RatingKind } from 'frogbot/fields';
import type {
  ClientField,
  DefaultCellComponentProps,
  NumberFieldClientProps,
  NumberFieldValidation,
  Validate,
} from 'payload';
import { useCallback } from 'react';

import { getFieldKind, isEmptyKindValue } from '../kind.js';
import { KindFieldLayout } from '../KindFieldLayout/index.client.js';

export type RatingStarsProps = {
  max: number;
  value: number;
};

function getRatingMax(field: ClientField): number {
  const { max = 5 } = (getFieldKind(field) ?? {}) as Partial<RatingKind>;

  return max;
}

function isRating(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;
}

export function RatingStars({ max, value }: RatingStarsProps) {
  return (
    <span aria-label={`${value} of ${max}`} className="rating-stars" role="img">
      {Array.from({ length: max }, (_, index) => (
        <StarIcon
          aria-hidden="true"
          className={
            index < value ? 'rating-stars__star rating-stars__star--on' : 'rating-stars__star'
          }
          key={index}
          size={16}
        />
      ))}
    </span>
  );
}

export function RatingCell(props: DefaultCellComponentProps) {
  const { cellData, field } = props;

  if (isEmptyKindValue(cellData)) return null;

  const max = getRatingMax(field);

  if (!isRating(cellData, max)) return <DefaultCell {...props} />;

  return <DefaultCell {...props} cellData={<RatingStars max={max} value={cellData} />} />;
}

function readOnlyRating({ max, value }: { max: number; value: unknown }) {
  if (isEmptyKindValue(value)) return null;

  if (!isRating(value, max)) return String(value);

  return <RatingStars max={max} value={value} />;
}

function RatingFieldComponent(props: NumberFieldClientProps) {
  const { field, path: pathFromProps, readOnly, validate } = props;
  const { label, max: fieldMax, min, required } = field;

  const { i18n } = useTranslation();
  const max = getRatingMax(field as ClientField);

  const memoizedValidate = useCallback<Validate>(
    (value, options) =>
      validate?.(value, {
        ...options,
        max: fieldMax,
        min,
        required,
      } as Parameters<NumberFieldValidation>[1]) ?? true,
    [validate, min, fieldMax, required],
  );

  const { customComponents, disabled, path, setValue, showError, value } = useField<number | null>({
    potentiallyStalePath: pathFromProps,
    validate: memoizedValidate,
  });

  return (
    <KindFieldLayout
      base="number"
      className="rating-field"
      customComponents={customComponents}
      field={field}
      labelAs="span"
      path={path}
      readOnly={readOnly || disabled}
      showError={showError}
    >
      {readOnly ? (
        <div className="rating-field__value">{readOnlyRating({ max, value })}</div>
      ) : (
        <div
          aria-label={label ? getTranslation(label, i18n) : undefined}
          className="rating-field__control"
          role="radiogroup"
        >
          {Array.from({ length: max }, (_, index) => {
            const star = index + 1;

            return (
              <label className="rating-field__option" key={star}>
                <input
                  checked={value === star}
                  className="rating-field__input"
                  disabled={disabled}
                  name={path}
                  onChange={() => setValue(star)}
                  onClick={() => {
                    if (value === star) setValue(null);
                  }}
                  type="radio"
                  value={star}
                />
                <StarIcon
                  aria-hidden="true"
                  className={
                    typeof value === 'number' && star <= value
                      ? 'rating-field__star rating-field__star--on'
                      : 'rating-field__star'
                  }
                  size={20}
                />
                <span className="rating-field__text">
                  {star === 1 ? '1 star' : `${star} stars`}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </KindFieldLayout>
  );
}

export const RatingField = withCondition(RatingFieldComponent);
