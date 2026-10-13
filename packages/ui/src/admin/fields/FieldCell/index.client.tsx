'use client';

import { DefaultCell, useConfig } from '@payloadcms/ui';
import type { ClientField, DefaultCellComponentProps } from 'payload';
import { Fragment } from 'react';

import { toCellData } from '../../views/cells.js';
import { getFieldKind, isEmptyKindValue } from '../kind.js';
import { hasOptionColors } from '../optionColor.js';
import { OptionPills } from '../OptionPills/index.client.js';
import { kindCells } from './kindCells.js';
import { resolveVirtualSource } from './resolveVirtualSource.js';

function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function renderFromSource({
  props,
  source,
}: {
  props: DefaultCellComponentProps;
  source: ClientField;
}) {
  const { label, name } = props.field as { label?: unknown; name?: string };
  const item = { ...source, label, name } as ClientField;

  if (!Array.isArray(props.cellData)) return <FieldCell {...props} field={item} />;

  const values = props.cellData.filter((value) => !isEmptyKindValue(value));

  if (values.length === 0) return <FieldCell {...props} cellData={null} field={item} />;

  const itemField = { ...item, hasMany: false } as ClientField;
  const { onClick: _onClick, ...unlinked } = props;

  return values.map((value, index) => (
    <Fragment key={index}>
      {index > 0 && ', '}
      <FieldCell
        {...(index === 0 ? props : { ...unlinked, link: false })}
        cellData={value}
        field={itemField}
      />
    </Fragment>
  ));
}

export function FieldCell(props: DefaultCellComponentProps) {
  const { getEntityConfig } = useConfig();
  const { collectionSlug, field } = props;

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

  const source =
    'virtual' in field && typeof field.virtual === 'string'
      ? resolveVirtualSource({ collectionSlug, getEntityConfig, path: field.virtual })
      : undefined;

  if (source) return renderFromSource({ props, source });

  if (
    (field.type === 'select' || field.type === 'radio') &&
    hasOptionColors(field) &&
    !isEmptyValue(cellData)
  ) {
    return <OptionPills {...props} cellData={cellData} />;
  }

  return <DefaultCell {...props} cellData={cellData} />;
}
