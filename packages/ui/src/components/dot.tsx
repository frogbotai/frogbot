import type { ComponentProps } from 'react';
export type DotProps = ComponentProps<'div'> & {
  animation?: boolean;
  variant?: 'destructive' | 'primary';
};
export function Dot({ animation = false, className, variant, ...props }: DotProps) {
  return (
    <div
      className={`fb-dot${variant ? ` fb-dot--${variant}` : ''}${animation ? ' fb-dot--animated' : ''}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
