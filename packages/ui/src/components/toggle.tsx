'use client';
import * as Primitive from '@radix-ui/react-toggle';
import type { ComponentProps } from 'react';
export type ToggleProps = ComponentProps<typeof Primitive.Root> & {
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm' | 'lg';
};
export function Toggle({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ToggleProps) {
  return (
    <Primitive.Root
      className={`fb-toggle fb-toggle--${variant} fb-toggle--${size}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
