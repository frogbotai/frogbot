'use client';

import { DefaultCell, TextField, useField, withCondition } from '@payloadcms/ui';
import { formatPhone, getPhoneHref } from 'frogbot/fields';
import type { DefaultCellComponentProps, TextFieldClientProps } from 'payload';

import { isEmptyKindValue } from '../kind.js';
import { KindFieldLayout } from '../KindFieldLayout/index.client.js';
import { KindLink } from '../KindLink/index.client.js';

export function PhoneCell(props: DefaultCellComponentProps) {
  const { cellData, link, onClick } = props;

  if (isEmptyKindValue(cellData)) return null;

  const href = getPhoneHref({ value: cellData });

  if (href === undefined) return <DefaultCell {...props} />;

  const text = formatPhone({ value: cellData });

  const drawn =
    link || typeof onClick === 'function' ? text : <KindLink href={href}>{text}</KindLink>;

  return <DefaultCell {...props} cellData={drawn} />;
}

function PhoneReadOnlyComponent(props: TextFieldClientProps) {
  const { field, path: pathFromProps } = props;

  const { customComponents, path, showError, value } = useField<string | null>({
    potentiallyStalePath: pathFromProps,
  });

  return (
    <KindFieldLayout
      base="text"
      className="phone-field"
      customComponents={customComponents}
      field={field}
      path={path}
      readOnly
      showError={showError}
    >
      <div className="phone-field__value">{formatPhone({ value })}</div>
    </KindFieldLayout>
  );
}

const PhoneReadOnly = withCondition(PhoneReadOnlyComponent);

export function PhoneField(props: TextFieldClientProps) {
  return props.readOnly ? <PhoneReadOnly {...props} /> : <TextField {...props} />;
}
