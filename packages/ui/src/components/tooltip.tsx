'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ComponentPropsWithRef, ReactElement, ReactNode } from 'react';
import { useId } from 'react';

import { PortalTheme } from '../theme/provider.js';

/** Props other than these are passed to `children`, so a tooltip can sit inside another `asChild` trigger. */
export interface TooltipProps extends Omit<
  ComponentPropsWithRef<typeof TooltipPrimitive.Trigger>,
  'asChild' | 'children'
> {
  /** The element the tooltip describes. It must accept a ref and forward hover and focus events. */
  children: ReactElement;
  /** Classes added to the tooltip bubble. */
  contentClassName?: string;
  /** Milliseconds to wait on hover before showing. @default 500 */
  delay?: number;
  /** Never shows the tooltip, keeping `children` mounted as they are. @default false */
  disabled?: boolean;
  /** The tooltip's text or content. */
  label: ReactNode;
  /** Shows or hides the tooltip yourself, instead of on hover and focus. */
  open?: boolean;
  /** The side of `children` the tooltip prefers; it flips when there isn't room. @default 'top' */
  side?: 'bottom' | 'left' | 'right' | 'top';
}

function TooltipCaret() {
  const clip = useId();

  return (
    <svg aria-hidden="true" className="fb-tooltip__caret" height="7" viewBox="0 0 14 7" width="15">
      <clipPath id={clip}>
        <rect height="14" width="15" x="-0.5" y="0.5" />
      </clipPath>
      <path
        className="fb-tooltip__caret-stroke"
        clipPath={`url(#${clip})`}
        d="M0,0 H14 L7.875,6.125 Q7,7 6.125,6.125 Z"
      />
      <path className="fb-tooltip__caret-fill" d="M0,0 H14 L7.875,6.125 Q7,7 6.125,6.125 Z" />
    </svg>
  );
}

/** A label shown beside `children` on hover and keyboard focus, styled like the admin panel's tooltips. */
export function Tooltip({
  children,
  contentClassName,
  delay = 500,
  disabled = false,
  label,
  open,
  side = 'top',
  ...triggerProps
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delay} disableHoverableContent>
      <TooltipPrimitive.Root open={disabled ? false : open}>
        <TooltipPrimitive.Trigger asChild {...triggerProps}>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <PortalTheme>
            <TooltipPrimitive.Content
              className={`fb-tooltip${contentClassName ? ` ${contentClassName}` : ''}`}
              collisionPadding={4}
              side={side}
              sideOffset={3}
            >
              {label}
              <TooltipPrimitive.Arrow asChild height={7} width={15}>
                <TooltipCaret />
              </TooltipPrimitive.Arrow>
            </TooltipPrimitive.Content>
          </PortalTheme>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
