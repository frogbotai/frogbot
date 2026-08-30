'use client';
import * as Primitive from '@radix-ui/react-accordion';
import type { ComponentProps } from 'react';
import ChevronDownIcon from '../icons/icons/ChevronDownIcon';
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
        {children}
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
