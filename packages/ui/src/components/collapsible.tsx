'use client';
import * as Primitive from '@radix-ui/react-collapsible';
import type { ComponentProps } from 'react';
export const Collapsible = Primitive.Root;
export function CollapsibleTrigger({
  className,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={`fb-collapsible__trigger${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export function CollapsibleContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      className={`fb-collapsible__content${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
