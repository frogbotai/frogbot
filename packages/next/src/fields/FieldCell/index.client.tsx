'use client';

import { DefaultCell } from '@payloadcms/ui';
import type { DefaultCellComponentProps } from 'payload';

import { toCellData } from '../../views/cells.js';
import { getFieldKind } from '../kind.js';
import { kindCells } from './kindCells.js';

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

  return <DefaultCell {...props} cellData={cellData} />;
}
