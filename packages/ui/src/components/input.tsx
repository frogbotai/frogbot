import type { ComponentProps } from 'react';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return <input className={`fb-input${className ? ` ${className}` : ''}`} type={type} {...props} />;
}
