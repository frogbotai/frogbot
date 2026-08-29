import type { InputHTMLAttributes } from 'react';

export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`fb-input${className ? ` ${className}` : ''}`} type={type} {...props} />;
}
