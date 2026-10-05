'use client';

import './index.css';

import { Input } from '@frogbotai/ui';
import { getTranslation } from '@payloadcms/translations';
import { DefaultCell, useField, useTranslation, withCondition } from '@payloadcms/ui';
import { formatDuration, parseDuration } from 'frogbot/fields';
import type { DurationFormat, DurationKind } from 'frogbot/fields';
import type {
  ClientField,
  DefaultCellComponentProps,
  NumberField,
  NumberFieldClientProps,
} from 'payload';
import { useCallback, useMemo } from 'react';

import { getFieldKind, isEmptyKindValue } from '../kind.js';
import { KindFieldLayout } from '../KindFieldLayout/index.client.js';
import { parsedInputValidate, useParsedInput } from '../KindFieldLayout/useParsedInput.js';

const durationMessage = 'Enter a duration such as 1:30.';

type DurationFieldAdmin = Pick<NonNullable<NumberField['admin']>, 'placeholder'>;

function getDurationFormat(field: ClientField): DurationFormat | undefined {
  return ((getFieldKind(field) ?? {}) as Partial<DurationKind>).format;
}

function readOnlyDuration({ format, value }: { format?: DurationFormat; value: unknown }): string {
  if (isEmptyKindValue(value)) return '';

  return Number.isSafeInteger(value) ? formatDuration({ format, value }) : String(value);
}

export function DurationCell(props: DefaultCellComponentProps) {
  const { cellData, field } = props;

  if (isEmptyKindValue(cellData)) return null;

  if (!Number.isSafeInteger(cellData)) return <DefaultCell {...props} />;

  return (
    <DefaultCell
      {...props}
      cellData={formatDuration({ value: cellData, format: getDurationFormat(field) })}
    />
  );
}

function DurationFieldComponent(props: NumberFieldClientProps) {
  const { field, path: pathFromProps, readOnly, validate } = props;
  const { admin, max, min, required } = field;
  const { placeholder } = (admin ?? {}) as DurationFieldAdmin;

  const { i18n } = useTranslation();
  const format = getDurationFormat(field as ClientField) ?? 'h:mm:ss';

  const memoizedValidate = useMemo(
    () => parsedInputValidate({ max, message: durationMessage, min, required, validate }),
    [max, min, required, validate],
  );

  const { customComponents, disabled, formSubmitted, path, setValue, showError, value } = useField<
    number | null | string
  >({
    potentiallyStalePath: pathFromProps,
    validate: memoizedValidate,
  });

  const formatInput = useCallback(
    (inputValue: unknown) => formatDuration({ format, value: inputValue }),
    [format],
  );

  const parseInput = useCallback((text: string) => parseDuration({ format, text }), [format]);

  const { held, heldShown, onBlur, onChange, text } = useParsedInput({
    format: formatInput,
    parse: parseInput,
    path,
    setValue,
    validate: memoizedValidate,
    value,
  });

  const heldError = heldShown || (held && formSubmitted);

  return (
    <KindFieldLayout
      base="number"
      className="duration-field"
      customComponents={customComponents}
      errorMessage={heldError ? durationMessage : undefined}
      field={field}
      path={path}
      readOnly={readOnly || disabled}
      showError={showError || heldError}
    >
      {readOnly ? (
        <div className="duration-field__value">{readOnlyDuration({ format, value })}</div>
      ) : (
        <Input
          disabled={disabled}
          id={`field-${path.replace(/\./g, '__')}`}
          name={path}
          onBlur={onBlur}
          onChange={onChange}
          placeholder={placeholder ? getTranslation(placeholder, i18n) : format}
          type="text"
          value={text}
        />
      )}
    </KindFieldLayout>
  );
}

export const DurationField = withCondition(DurationFieldComponent);
