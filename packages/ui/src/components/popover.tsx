'use client';
import * as Primitive from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';

import { PortalTheme } from '../theme/provider.js';
export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverAnchor = Primitive.Anchor;
export function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <PortalTheme>
        <Primitive.Content
          align={align}
          sideOffset={sideOffset}
          className={`fb-popover__content${className ? ` ${className}` : ''}`}
          {...props}
        />
      </PortalTheme>
    </Primitive.Portal>
  );
}
