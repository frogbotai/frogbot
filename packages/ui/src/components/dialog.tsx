'use client';

import * as Primitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';

import XIcon from '../icons/icons/XIcon';
import { PortalTheme } from '../theme/provider';

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogPortal = Primitive.Portal;
export const DialogClose = Primitive.Close;

export function DialogOverlay({ className, ...props }: ComponentProps<typeof Primitive.Overlay>) {
  return (
    <Primitive.Overlay
      className={`fb-dialog__overlay${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}

export function DialogContent({
  children,
  className,
  showOverlay = true,
  withCloseButton = true,
  ...props
}: ComponentProps<typeof Primitive.Content> & {
  showOverlay?: boolean;
  withCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <PortalTheme>
        {showOverlay && <DialogOverlay />}
        <Primitive.Content
          className={`fb-dialog__content${className ? ` ${className}` : ''}`}
          {...props}
        >
          {children}
          {withCloseButton && (
            <Primitive.Close className="fb-dialog__close">
              <XIcon className="fb-dialog__close-icon" />
              <span className="fb-dialog__close-label">Close</span>
            </Primitive.Close>
          )}
        </Primitive.Content>
      </PortalTheme>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={`fb-dialog__header${className ? ` ${className}` : ''}`} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={`fb-dialog__footer${className ? ` ${className}` : ''}`} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof Primitive.Title>) {
  return (
    <Primitive.Title className={`fb-dialog__title${className ? ` ${className}` : ''}`} {...props} />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof Primitive.Description>) {
  return (
    <Primitive.Description
      className={`fb-dialog__description${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
