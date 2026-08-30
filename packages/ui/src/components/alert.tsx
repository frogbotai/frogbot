import type { ComponentProps } from 'react';
export type AlertProps = ComponentProps<'div'> & {
  variant?: 'default' | 'warning' | 'destructive' | 'primary';
};
export function Alert({ className, variant = 'default', ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={`fb-alert fb-alert--${variant}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
export function AlertTitle({ className, ...props }: ComponentProps<'h5'>) {
  return <h5 className={`fb-alert__title${className ? ` ${className}` : ''}`} {...props} />;
}
export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div className={`fb-alert__description${className ? ` ${className}` : ''}`} {...props} />;
}
