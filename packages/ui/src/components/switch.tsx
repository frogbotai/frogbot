'use client';
import * as Primitive from '@radix-ui/react-switch';
import type { ComponentProps, ReactNode } from 'react';
export type SwitchProps = ComponentProps<typeof Primitive.Root> & {
  checkedIcon?: ReactNode;
  uncheckedIcon?: ReactNode;
  variant?: 'default' | 'square';
  size?: 'default' | 'sm' | 'lg' | 'xl';
  color?: 'default' | 'secondary';
};
export function Switch({
  className,
  checkedIcon,
  uncheckedIcon,
  variant = 'default',
  size = 'default',
  color = 'default',
  ...props
}: SwitchProps) {
  return (
    <Primitive.Root
      className={`fb-switch fb-switch--${variant} fb-switch--${size} fb-switch--${color}${className ? ` ${className}` : ''}`}
      {...props}
    >
      <Primitive.Thumb className="fb-switch__thumb">
        <span className="fb-switch__checked-icon">{checkedIcon}</span>
        <span className="fb-switch__unchecked-icon">{uncheckedIcon ?? checkedIcon}</span>
      </Primitive.Thumb>
    </Primitive.Root>
  );
}
