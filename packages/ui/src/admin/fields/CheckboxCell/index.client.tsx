'use client';

import './index.css';

import { getTranslation } from '@payloadcms/translations';
import { CheckboxInput, useTranslation } from '@payloadcms/ui';
import type { DefaultCellComponentProps } from 'payload';
import { useEffect, useState } from 'react';

import { useCellToggle } from '../../views/List/cellEdit/CellToggle.client.js';

/**
 * A checkbox field's list cell: a checkbox, not `true` or `false`. Where the list lets this person
 * edit the column, clicking it saves the new value in place.
 */
export function CheckboxCell({ cellData, field, rowData }: DefaultCellComponentProps) {
  const { i18n } = useTranslation();
  const [checked, setChecked] = useState(cellData === true);
  const accessor =
    ('accessor' in field ? (field.accessor as string | undefined) : undefined) ??
    ('name' in field ? field.name : undefined);

  const rowId = rowData?.id === undefined || rowData.id === null ? undefined : String(rowData.id);
  const toggle = useCellToggle(rowId, accessor);
  const label = 'label' in field && field.label ? getTranslation(field.label, i18n) : accessor;

  useEffect(() => setChecked(cellData === true), [cellData]);

  return (
    <CheckboxInput
      aria-label={typeof label === 'string' ? label : undefined}
      checked={checked}
      className="fb-checkbox-cell"
      onToggle={() => toggle?.(!checked, setChecked)}
      readOnly={!toggle}
      variant="muted"
    />
  );
}
