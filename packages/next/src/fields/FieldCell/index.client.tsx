'use client';

import { DefaultCell } from '@payloadcms/ui';
import type { DefaultCellComponentProps } from 'payload';

import { toCellData } from '../../views/cells.js';
import { getFieldKind } from '../kind.js';
import { hasOptionColors } from '../optionColor.js';
import { OptionPills } from '../OptionPills/index.client.js';
import { kindCells } from './kindCells.js';

function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function FieldCell(props: DefaultCellComponentProps) {
  const { field } = props;

  const cellData: DefaultCellComponentProps['cellData'] =
    field.type === 'relationship' || field.type === 'upload'
      ? Array.isArray(props.cellData)
        ? props.cellData.map(toCellData)
        : toCellData(props.cellData)
      : props.cellData;

  const accessor =
    ('accessor' in field ? (field.accessor as string | undefined) : undefined) ??
    ('name' in field ? field.name : undefined);

  if (accessor === 'id') return String(cellData ?? '');

  const kind = getFieldKind(field);

  if (kind && Object.hasOwn(kindCells, kind.type)) {
    const KindCell = kindCells[kind.type];

    return <KindCell {...props} cellData={cellData} />;
  }

  if (
    (field.type === 'select' || field.type === 'radio') &&
    hasOptionColors(field) &&
    !isEmptyValue(cellData)
  )
    return <OptionPills {...props} cellData={cellData} />;

  return <DefaultCell {...props} cellData={cellData} />;
}
