'use client';
import * as Primitive from '@radix-ui/react-avatar';
import type { ComponentProps } from 'react';
export function Avatar({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root className={`fb-avatar${className ? ` ${className}` : ''}`} {...props} />;
}
export function AvatarImage({ className, ...props }: ComponentProps<typeof Primitive.Image>) {
  return (
    <Primitive.Image className={`fb-avatar__image${className ? ` ${className}` : ''}`} {...props} />
  );
}
export function AvatarFallback({ className, ...props }: ComponentProps<typeof Primitive.Fallback>) {
  return (
    <Primitive.Fallback
      className={`fb-avatar__fallback${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
