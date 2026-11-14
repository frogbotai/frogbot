'use client';

import './index.css';

import { getTranslation } from '@payloadcms/translations';
import { DefaultCell, useField, useTranslation, withCondition } from '@payloadcms/ui';
import { type ColorKind, getHexColor } from 'frogbot/fields';
import type {
  ClientField,
  DefaultCellComponentProps,
  TextField,
  TextFieldClientProps,
  TextFieldValidation,
  Validate,
} from 'payload';
import { useCallback } from 'react';

import { Input } from '../../../components/input.js';
import { getFieldKind, isEmptyKindValue, isKindReadOnly } from '../kind.js';
import { KindFieldLayout } from '../KindFieldLayout/index.client.js';

const pickerValueWithoutColor = '#010101';

type ColorFieldAdmin = Pick<NonNullable<TextField['admin']>, 'autoComplete' | 'placeholder'>;

function getSwatches(field: ClientField): string[] {
  const { swatches } = (getFieldKind(field) ?? {}) as Partial<ColorKind>;

  return Array.isArray(swatches) ? swatches : [];
}

function ColorSwatch({ color }: { color: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className={color ? 'color-swatch' : 'color-swatch color-swatch--empty'}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

function ColorValue({ value }: { value: unknown }) {
  if (isEmptyKindValue(value)) return null;

  const color = getHexColor({ value });

  return (
    <span className="color-value">
      {color && <ColorSwatch color={color} />}
      <span className="color-value__text">{String(value)}</span>
    </span>
  );
}

export function ColorCell(props: DefaultCellComponentProps) {
  const { cellData } = props;

  if (isEmptyKindValue(cellData)) return null;

  if (!getHexColor({ value: cellData })) return <DefaultCell {...props} />;

  return <DefaultCell {...props} cellData={<ColorValue value={cellData} />} />;
}

function ColorFieldComponent(props: TextFieldClientProps) {
  const { field, path: pathFromProps, validate } = props;
  const readOnly = isKindReadOnly(props);
  const { admin, label, required } = field;
  const { autoComplete, placeholder } = (admin ?? {}) as ColorFieldAdmin;

  const { i18n } = useTranslation();
  const swatches = getSwatches(field as ClientField);
  const fieldLabel = label ? getTranslation(label, i18n) : undefined;

  const memoizedValidate = useCallback<Validate>(
    (value, options) =>
      validate?.(value, { ...options, required } as Parameters<TextFieldValidation>[1]) ?? true,
    [validate, required],
  );

  const { customComponents, disabled, path, setValue, showError, value } = useField<string | null>({
    potentiallyStalePath: pathFromProps,
    validate: memoizedValidate,
  });

  const color = getHexColor({ value });

  return (
    <KindFieldLayout
      base="text"
      className="color-field"
      customComponents={customComponents}
      field={field}
      path={path}
      readOnly={readOnly || disabled}
      showError={showError}
    >
      {readOnly ? (
        <div className="color-field__value">
          <ColorValue value={value} />
        </div>
      ) : (
        <>
          <div className="color-field__control">
            <Input
              autoComplete={autoComplete || undefined}
              dir="ltr"
              disabled={disabled}
              id={`field-${path.replace(/\./g, '__')}`}
              name={path}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder ? getTranslation(placeholder, i18n) : '#3b82f6'}
              spellCheck={false}
              type="text"
              value={value ?? ''}
            />
            <label className="color-field__picker">
              <input
                aria-label={fieldLabel ? `Pick a color for ${fieldLabel}` : 'Pick a color'}
                className="color-field__native"
                disabled={disabled}
                onChange={(event) => setValue(event.target.value)}
                type="color"
                value={color ?? pickerValueWithoutColor}
              />
              <ColorSwatch color={color} />
            </label>
          </div>
          {swatches.length > 0 && (
            <div
              aria-label={fieldLabel ? `${fieldLabel} swatches` : 'Swatches'}
              className="color-field__swatches"
              role="group"
            >
              {swatches.map((swatch) => (
                <button
                  aria-label={swatch}
                  aria-pressed={swatch === color}
                  className="color-field__swatch"
                  disabled={disabled}
                  key={swatch}
                  onClick={() => setValue(swatch)}
                  style={{ backgroundColor: swatch }}
                  title={swatch}
                  type="button"
                />
              ))}
            </div>
          )}
        </>
      )}
    </KindFieldLayout>
  );
}

export const ColorField = withCondition(ColorFieldComponent);
