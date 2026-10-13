'use client';

import './index.css';

import { DefaultCell } from '@payloadcms/ui';
import { getUrlHref } from 'frogbot/fields';
import type { DefaultCellComponentProps } from 'payload';

import { isEmptyKindValue } from '../kind.js';
import { KindLink } from '../KindLink/index.client.js';

export function UrlCell(props: DefaultCellComponentProps) {
  const { cellData, link, onClick } = props;

  if (isEmptyKindValue(cellData)) return null;

  const href = getUrlHref({ value: cellData });

  if (href === undefined) return <DefaultCell {...props} />;

  const value = String(cellData);

  const drawn =
    link || typeof onClick === 'function' ? (
      <span className="url-cell" title={value}>
        {value}
      </span>
    ) : (
      <KindLink className="url-cell" external href={href} title={value}>
        {value}
      </KindLink>
    );

  return <DefaultCell {...props} cellData={drawn} />;
}
