'use client';
import * as Primitive from '@radix-ui/react-context-menu';
import type { ComponentProps } from 'react';
import CheckIcon from '../icons/icons/CheckIcon';
import ChevronRightIcon from '../icons/icons/ChevronRightIcon';
export const ContextMenu = Primitive.Root;
export const ContextMenuTrigger = Primitive.Trigger;
export const ContextMenuGroup = Primitive.Group;
export const ContextMenuPortal = Primitive.Portal;
export const ContextMenuSub = Primitive.Sub;
export const ContextMenuRadioGroup = Primitive.RadioGroup;
export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        className={`fb-context-menu__content${className ? ` ${className}` : ''}`}
        {...props}
      />
    </Primitive.Portal>
  );
}
export function ContextMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.SubContent>) {
  return (
    <Primitive.SubContent
      className={`fb-context-menu__content${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export function ContextMenuItem({
  className,
  inset,
  ...props
}: ComponentProps<typeof Primitive.Item> & { inset?: boolean }) {
  return (
    <Primitive.Item
      className={`fb-context-menu__item${inset ? ' fb-context-menu__item--inset' : ''}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: ComponentProps<typeof Primitive.SubTrigger> & { inset?: boolean }) {
  return (
    <Primitive.SubTrigger
      className={`fb-context-menu__item${inset ? ' fb-context-menu__item--inset' : ''}${className ? ` ${className}` : ''}`}
      {...props}
    >
      {children}
      <ChevronRightIcon className="fb-context-menu__icon" />
    </Primitive.SubTrigger>
  );
}
export function ContextMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.CheckboxItem>) {
  return (
    <Primitive.CheckboxItem
      className={`fb-context-menu__item fb-context-menu__item--indicator${className ? ` ${className}` : ''}`}
      {...props}
    >
      <span className="fb-context-menu__indicator">
        <Primitive.ItemIndicator>
          <CheckIcon />
        </Primitive.ItemIndicator>
      </span>
      {children}
    </Primitive.CheckboxItem>
  );
}
export function ContextMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem
      className={`fb-context-menu__item fb-context-menu__item--indicator${className ? ` ${className}` : ''}`}
      {...props}
    >
      <span className="fb-context-menu__indicator">
        <Primitive.ItemIndicator>
          <span className="fb-context-menu__dot" />
        </Primitive.ItemIndicator>
      </span>
      {children}
    </Primitive.RadioItem>
  );
}
export function ContextMenuLabel({
  className,
  inset,
  ...props
}: ComponentProps<typeof Primitive.Label> & { inset?: boolean }) {
  return (
    <Primitive.Label
      className={`fb-context-menu__label${inset ? ' fb-context-menu__label--inset' : ''}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export function ContextMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Primitive.Separator>) {
  return (
    <Primitive.Separator
      className={`fb-context-menu__separator${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export function ContextMenuShortcut({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span className={`fb-context-menu__shortcut${className ? ` ${className}` : ''}`} {...props} />
  );
}
