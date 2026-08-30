'use client';
import * as Primitive from '@radix-ui/react-separator';
import type { ComponentProps } from 'react';
export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      decorative={decorative}
      orientation={orientation}
      className={`fb-separator fb-separator--${orientation}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export function HorizontalSeparatorWithText({
  className,
  children,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div className={`fb-separator-text${className ? ` ${className}` : ''}`} {...props}>
      <span className="fb-separator-text__line" />
      <span className="fb-separator-text__label">{children}</span>
      <span className="fb-separator-text__line" />
    </div>
  );
}
