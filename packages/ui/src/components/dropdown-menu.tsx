'use client';

import * as Primitive from '@radix-ui/react-dropdown-menu';
import type { ComponentProps } from 'react';

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuSub = Primitive.Sub;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;
export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        className={`fb-dropdown-menu__content${className ? ` ${className}` : ''}`}
        sideOffset={sideOffset}
        {...props}
      />
    </Primitive.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={`fb-dropdown-menu__item${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      className={`fb-dropdown-menu__label${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Primitive.Separator>) {
  return (
    <Primitive.Separator
      className={`fb-dropdown-menu__separator${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export const DropdownMenuCheckboxItem = Primitive.CheckboxItem;
export const DropdownMenuRadioItem = Primitive.RadioItem;
export const DropdownMenuItemIndicator = Primitive.ItemIndicator;
export const DropdownMenuSubTrigger = Primitive.SubTrigger;
export const DropdownMenuSubContent = Primitive.SubContent;
