import type { ComponentProps } from 'react';
export type BadgeProps = ComponentProps<'div'> & {
  variant?: 'default' | 'accent' | 'destructive' | 'outline' | 'ghost' | 'success';
};
export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={`fb-badge fb-badge--${variant}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
