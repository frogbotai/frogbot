'use client';

import {
  FieldDescription,
  FieldError,
  FieldLabel,
  type FieldType,
  RenderCustomComponent,
} from '@payloadcms/ui';
import type { NumberFieldClientProps, TextFieldClientProps } from 'payload';
import { type CSSProperties, type ReactNode, useMemo } from 'react';

export type KindFieldLayoutProps = {
  base: 'number' | 'text';
  children: ReactNode;
  className: string;
  customComponents: FieldType<unknown>['customComponents'];
  errorMessage?: string;
  field: NumberFieldClientProps['field'] | TextFieldClientProps['field'];
  labelAs?: 'label' | 'span';
  path: string;
  readOnly?: boolean;
  showError: boolean;
};

export function KindFieldLayout({
  base,
  children,
  className,
  customComponents: { AfterInput, BeforeInput, Description, Error, Label } = {},
  errorMessage,
  field: { admin, label, localized, required },
  labelAs,
  path,
  readOnly,
  showError,
}: KindFieldLayoutProps) {
  const style = useMemo<CSSProperties>(
    () => ({
      ...admin?.style,
      ...(admin?.width ? { '--field-width': admin.width } : { flex: '1 1 auto' }),
      ...(admin?.style?.flex ? { flex: admin.style.flex } : {}),
    }),
    [admin?.style, admin?.width],
  );

  const wrapperClassName = [
    'field-type',
    base,
    className,
    admin?.className,
    showError && 'error',
    readOnly && 'read-only',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClassName} style={style}>
      <RenderCustomComponent
        CustomComponent={Label}
        Fallback={
          <FieldLabel
            as={labelAs}
            label={label}
            localized={localized}
            path={path}
            required={required}
          />
        }
      />
      <div className="field-type__wrap">
        <RenderCustomComponent
          CustomComponent={Error}
          Fallback={<FieldError message={errorMessage} path={path} showError={showError} />}
        />
        {BeforeInput}
        {children}
        {AfterInput}
        <RenderCustomComponent
          CustomComponent={Description}
          Fallback={<FieldDescription description={admin?.description} path={path} />}
        />
      </div>
    </div>
  );
}
