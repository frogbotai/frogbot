'use client';

import * as Primitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';

import XIcon from '../icons/icons/XIcon';
import { PortalTheme } from '../theme/provider';

export const Sheet = Primitive.Root;
export const SheetTrigger = Primitive.Trigger;
export const SheetClose = Primitive.Close;
export function SheetContent({
  children,
  className,
  side = 'right',
  ...props
}: ComponentProps<typeof Primitive.Content> & { side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <Primitive.Portal>
      <PortalTheme>
        <Primitive.Overlay className="fb-sheet__overlay" />
        <Primitive.Content
          className={`fb-sheet__content fb-sheet__content--${side}${className ? ` ${className}` : ''}`}
          {...props}
        >
          {children}
          <Primitive.Close className="fb-sheet__close">
            <XIcon className="fb-sheet__close-icon" />
            <span className="fb-sheet__close-label">Close</span>
          </Primitive.Close>
        </Primitive.Content>
      </PortalTheme>
    </Primitive.Portal>
  );
}
export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={`fb-sheet__header${className ? ` ${className}` : ''}`} {...props} />;
}
export function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={`fb-sheet__footer${className ? ` ${className}` : ''}`} {...props} />;
}
export function SheetTitle({ className, ...props }: ComponentProps<typeof Primitive.Title>) {
  return (
    <Primitive.Title className={`fb-sheet__title${className ? ` ${className}` : ''}`} {...props} />
  );
}
export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof Primitive.Description>) {
  return (
    <Primitive.Description
      className={`fb-sheet__description${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
