'use client';

import './index.css';

import { OptionPill } from '@frogbotai/ui';
import { getTranslation } from '@payloadcms/translations';
import { DefaultCell, useTranslation } from '@payloadcms/ui';
import type { DefaultCellComponentProps, Option } from 'payload';

import { getOptionColor } from '../optionColor.js';

export function OptionPills(props: DefaultCellComponentProps) {
  const { cellData, field } = props;
  const { i18n } = useTranslation();

  const options: Option[] = 'options' in field && Array.isArray(field.options) ? field.options : [];
  const values: unknown[] = Array.isArray(cellData) ? cellData : [cellData];

  const pills = (
    <span className="option-pills">
      {values.map((value) => {
        const option = options.find(
          (candidate) => (typeof candidate === 'string' ? candidate : candidate.value) === value,
        );

        const label =
          option === undefined
            ? String(value)
            : typeof option === 'string'
              ? option
              : getTranslation(option.label, i18n) || option.value;

        return (
          <OptionPill color={getOptionColor({ field, value }) ?? 'gray'} key={String(value)}>
            {label}
          </OptionPill>
        );
      })}
    </span>
  );

  return (
    <DefaultCell
      {...props}
      field={{ ...field, options: [{ label: pills, value: cellData }] } as typeof field}
    />
  );
}
