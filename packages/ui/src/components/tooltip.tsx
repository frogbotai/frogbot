'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ComponentProps } from 'react';

import { PortalTheme } from '../theme/provider.js';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <PortalTheme>
        <TooltipPrimitive.Content
          className={`fb-tooltip__content${className ? ` ${className}` : ''}`}
          sideOffset={sideOffset}
          {...props}
        />
      </PortalTheme>
    </TooltipPrimitive.Portal>
  );
}
