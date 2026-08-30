'use client';
import * as Primitive from '@radix-ui/react-radio-group';
import type { ComponentProps } from 'react';
export function RadioGroup({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root className={`fb-radio-group${className ? ` ${className}` : ''}`} {...props} />
  );
}
export function RadioGroupItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={`fb-radio-group__item${className ? ` ${className}` : ''}`}
      {...props}
    >
      <Primitive.Indicator className="fb-radio-group__indicator" />
    </Primitive.Item>
  );
}
