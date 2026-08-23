import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

export function buttonVariants({
  className,
  size = 'default',
  variant = 'default',
}: {
  className?: string;
  size?: ButtonSize | null;
  variant?: ButtonVariant | null;
} = {}) {
  return `fb-button fb-button--${variant ?? 'default'} fb-button--size-${size ?? 'default'}${className ? ` ${className}` : ''}`;
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  size?: ButtonSize | null;
  variant?: ButtonVariant | null;
}

export function Button({ asChild, className, size, variant, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component className={buttonVariants({ className, size, variant })} {...props} />;
}
