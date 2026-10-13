'use client';

import { DefaultCell } from '@payloadcms/ui';
import type { DefaultCellComponentProps } from 'payload';

import { isEmptyKindValue } from '../kind.js';

export function BarcodeCell(props: DefaultCellComponentProps) {
  if (isEmptyKindValue(props.cellData)) return null;

  return <DefaultCell {...props} />;
}
