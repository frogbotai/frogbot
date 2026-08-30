import type { ComponentProps } from 'react';
export type TextareaProps = ComponentProps<'textarea'>;
export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={`fb-textarea${className ? ` ${className}` : ''}`} {...props} />;
}
