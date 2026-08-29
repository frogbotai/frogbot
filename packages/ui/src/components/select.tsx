'use client';

import * as Primitive from '@radix-ui/react-select';
import type { ComponentProps } from 'react';

import CheckIcon from '../icons/icons/CheckIcon';
import ChevronDownIcon from '../icons/icons/ChevronDownIcon';
import ChevronUpIcon from '../icons/icons/ChevronUpIcon';

export const Select = Primitive.Root;
export const SelectGroup = Primitive.Group;
export const SelectValue = Primitive.Value;
export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={`fb-select__trigger${className ? ` ${className}` : ''}`}
      {...props}
    >
      {children}
      <Primitive.Icon>
        <ChevronDownIcon className="fb-select__trigger-icon" />
      </Primitive.Icon>
    </Primitive.Trigger>
  );
}
export function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        className={`fb-select__content${className ? ` ${className}` : ''}`}
        position={position}
        {...props}
      >
        <Primitive.ScrollUpButton className="fb-select__scroll-up">
          <ChevronUpIcon className="fb-select__scroll-up-icon" />
        </Primitive.ScrollUpButton>
        <Primitive.Viewport className="fb-select__viewport">{children}</Primitive.Viewport>
        <Primitive.ScrollDownButton className="fb-select__scroll-down">
          <ChevronDownIcon className="fb-select__scroll-down-icon" />
        </Primitive.ScrollDownButton>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
export function SelectLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label className={`fb-select__label${className ? ` ${className}` : ''}`} {...props} />
  );
}
export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item className={`fb-select__item${className ? ` ${className}` : ''}`} {...props}>
      <Primitive.ItemText>{children}</Primitive.ItemText>
      <Primitive.ItemIndicator className="fb-select__item-indicator">
        <CheckIcon className="fb-select__item-indicator-icon" />
      </Primitive.ItemIndicator>
    </Primitive.Item>
  );
}
export function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof Primitive.Separator>) {
  return (
    <Primitive.Separator
      className={`fb-select__separator${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
