'use client';
import * as Primitive from '@radix-ui/react-label';
import type { ComponentProps } from 'react';
export function Label({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root className={`fb-label${className ? ` ${className}` : ''}`} {...props} />;
}
