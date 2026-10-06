'use client';

import './index.css';

import { Input } from '@frogbotai/ui';
import { getTranslation } from '@payloadcms/translations';
import { DefaultCell, useField, useTranslation, withCondition } from '@payloadcms/ui';
import type { MoneyKind } from 'frogbot/fields';
import { formatMoney } from 'frogbot/fields';
import type {
  ClientField,
  DefaultCellComponentProps,
  NumberField,
  NumberFieldClientProps,
  NumberFieldValidation,
  Validate,
} from 'payload';
import { type ChangeEvent, useCallback } from 'react';

import { getFieldKind } from '../kind.js';
import { KindFieldLayout } from '../KindFieldLayout/index.client.js';

type MoneyFieldAdmin = Pick<
  NonNullable<NumberField['admin']>,
  'autoComplete' | 'placeholder' | 'step'
>;

function getMoneyKind(field: ClientField): Partial<MoneyKind> {
  return (getFieldKind(field) ?? {}) as Partial<MoneyKind>;
}

function currencySymbol({ currency, locale }: { currency: string; locale: string }): string {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);

  return parts.find((part) => part.type === 'currency')?.value ?? currency;
}

export function MoneyCell(props: DefaultCellComponentProps) {
  const { i18n } = useTranslation();
  const { currency, precision } = getMoneyKind(props.field);

  const formatted = formatMoney({
    value: props.cellData,
    currency,
    precision,
    locale: i18n.language,
  });

  if (!formatted) return null;

  return <DefaultCell {...props} cellData={formatted} />;
}

function MoneyFieldComponent(props: NumberFieldClientProps) {
  const { field, path: pathFromProps, readOnly, validate } = props;
  const { admin, max, min, required } = field;
  const { autoComplete, placeholder, step = 'any' } = (admin ?? {}) as MoneyFieldAdmin;

  const { i18n } = useTranslation();
  const { currency = 'USD', precision } = getMoneyKind(field as ClientField);
  const locale = i18n.language;

  const memoizedValidate = useCallback<Validate>(
    (value, options) =>
      validate?.(value, {
        ...options,
        max,
        min,
        required,
      } as Parameters<NumberFieldValidation>[1]) ?? true,
    [validate, min, max, required],
  );

  const { customComponents, disabled, path, setValue, showError, value } = useField<number | null>({
    potentiallyStalePath: pathFromProps,
    validate: memoizedValidate,
  });

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const amount = parseFloat(event.target.value);

      setValue(Number.isNaN(amount) ? null : amount);
    },
    [setValue],
  );

  return (
    <KindFieldLayout
      base="number"
      className="money-field"
      customComponents={customComponents}
      field={field}
      path={path}
      readOnly={readOnly || disabled}
      showError={showError}
    >
      {readOnly ? (
        <div className="money-field__value">
          {formatMoney({ value, currency, precision, locale })}
        </div>
      ) : (
        <div className="money-field__control">
          <span className="money-field__currency">{currencySymbol({ currency, locale })}</span>
          <Input
            autoComplete={autoComplete || undefined}
            disabled={disabled}
            id={`field-${path.replace(/\./g, '__')}`}
            max={max}
            min={min}
            name={path}
            onChange={handleChange}
            onWheel={(event) => event.currentTarget.blur()}
            placeholder={placeholder ? getTranslation(placeholder, i18n) : undefined}
            step={step}
            type="number"
            value={typeof value === 'number' ? value : ''}
          />
        </div>
      )}
    </KindFieldLayout>
  );
}

export const MoneyField = withCondition(MoneyFieldComponent);
