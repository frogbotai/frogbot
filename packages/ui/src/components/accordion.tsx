'use client';
import * as Primitive from '@radix-ui/react-accordion';
import { Slottable } from '@radix-ui/react-slot';
import type { ComponentProps } from 'react';

import ChevronDownIcon from '../icons/icons/ChevronDownIcon.js';
export const Accordion = Primitive.Root;
export function AccordionItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={`fb-accordion__item${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Header className="fb-accordion__header">
      <Primitive.Trigger
        className={`fb-accordion__trigger${className ? ` ${className}` : ''}`}
        {...props}
      >
        <Slottable>{children}</Slottable>
        <ChevronDownIcon className="fb-accordion__icon" />
      </Primitive.Trigger>
    </Primitive.Header>
  );
}
export function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      className={`fb-accordion__content${className ? ` ${className}` : ''}`}
      {...props}
    >
      {children}
    </Primitive.Content>
  );
}
