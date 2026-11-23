'use client';

import { DefaultCell, useTranslation } from '@payloadcms/ui';
import type { ClientField, DefaultCellComponentProps } from 'payload';

import { formatShortDate } from '../shortDate.js';

/**
 * A date cell that writes the date as Asana does, "Nov 24", with the year only when it isn't
 * this year, and nothing for no date. Point a date field's `admin.components.Cell` at `@frogbotai/ui/admin#ShortDateCell`.
 */
export function ShortDateCell(props: DefaultCellComponentProps) {
  const { i18n } = useTranslation();
  const text = formatShortDate(props.cellData, { locale: i18n.language });

  if (!text) return null;

  return (
    <DefaultCell
      {...props}
      cellData={text}
      field={{ ...props.field, type: 'text' } as ClientField}
    />
  );
}
