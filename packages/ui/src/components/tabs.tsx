'use client';
import * as Primitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
export const Tabs = Primitive.Root;
export function TabsList({
  className,
  variant = 'default',
  ...props
}: ComponentProps<typeof Primitive.List> & { variant?: 'default' | 'outline' }) {
  return (
    <Primitive.List
      className={`fb-tabs__list fb-tabs__list--${variant}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export function TabsTrigger({
  className,
  variant = 'default',
  ...props
}: ComponentProps<typeof Primitive.Trigger> & { variant?: 'default' | 'outline' }) {
  return (
    <Primitive.Trigger
      className={`fb-tabs__trigger fb-tabs__trigger--${variant}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      className={`fb-tabs__content${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
