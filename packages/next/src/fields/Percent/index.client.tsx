'use client';

import './index.css';

import { Input } from '@frogbotai/ui';
import { DefaultCell, useField, useTranslation, withCondition } from '@payloadcms/ui';
import { formatPercent } from 'frogbot/fields';
import type { PercentKind } from 'frogbot/fields';
import type { ClientField, DefaultCellComponentProps, NumberFieldClientProps } from 'payload';
import { useMemo } from 'react';

import { getFieldKind, isEmptyKindValue } from '../kind.js';
import { KindFieldLayout } from '../KindFieldLayout/index.client.js';
import { parsedInputValidate, useParsedInput } from '../KindFieldLayout/useParsedInput.js';
import { parsePercentInput, percentToInput } from './percentInput.js';

const percentMessage = 'Enter a percentage such as 42.5.';

function getPercentPrecision(field: ClientField): number | undefined {
  return ((getFieldKind(field) ?? {}) as Partial<PercentKind>).precision;
}

export function PercentCell(props: DefaultCellComponentProps) {
  const { cellData, field } = props;
  const { i18n } = useTranslation();

  if (isEmptyKindValue(cellData)) return null;

  if (typeof cellData !== 'number' || !Number.isFinite(cellData)) return <DefaultCell {...props} />;

  return (
    <DefaultCell
      {...props}
      cellData={formatPercent({
        value: cellData,
        precision: getPercentPrecision(field),
        locale: i18n.language,
      })}
    />
  );
}

function PercentFieldComponent(props: NumberFieldClientProps) {
  const { field, path: pathFromProps, readOnly, validate } = props;
  const { max, min, required } = field;

  const { i18n } = useTranslation();

  const memoizedValidate = useMemo(
    () => parsedInputValidate({ max, message: percentMessage, min, required, validate }),
    [max, min, required, validate],
  );

  const { customComponents, disabled, formSubmitted, path, setValue, showError, value } = useField<
    number | null | string
  >({
    potentiallyStalePath: pathFromProps,
    validate: memoizedValidate,
  });

  const { held, heldShown, onBlur, onChange, text } = useParsedInput({
    format: percentToInput,
    parse: parsePercentInput,
    path,
    setValue,
    validate: memoizedValidate,
    value,
  });

  const heldError = heldShown || (held && formSubmitted);

  return (
    <KindFieldLayout
      base="number"
      className="percent-field"
      customComponents={customComponents}
      errorMessage={heldError ? percentMessage : undefined}
      field={field}
      path={path}
      readOnly={readOnly || disabled}
      showError={showError || heldError}
    >
      {readOnly ? (
        <div className="percent-field__value">
          {formatPercent({
            value,
            precision: getPercentPrecision(field as ClientField),
            locale: i18n.language,
          })}
        </div>
      ) : (
        <div className="percent-field__control">
          <Input
            disabled={disabled}
            id={`field-${path.replace(/\./g, '__')}`}
            inputMode="decimal"
            name={path}
            onBlur={onBlur}
            onChange={onChange}
            type="text"
            value={text}
          />
          <span className="percent-field__suffix">%</span>
        </div>
      )}
    </KindFieldLayout>
  );
}

export const PercentField = withCondition(PercentFieldComponent);
