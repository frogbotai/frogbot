'use client';
import * as Primitive from '@radix-ui/react-checkbox';
import type { ComponentProps } from 'react';

import CheckIcon from '../icons/icons/CheckIcon';
import MinusIcon from '../icons/icons/MinusIcon';
export type CheckboxProps = ComponentProps<typeof Primitive.Root> & {
  variant?: 'primary' | 'secondary';
};
export function Checkbox({ className, variant = 'primary', ...props }: CheckboxProps) {
  return (
    <Primitive.Root
      className={`fb-checkbox fb-checkbox--${variant}${className ? ` ${className}` : ''}`}
      {...props}
    >
      <Primitive.Indicator className="fb-checkbox__indicator">
        {props.checked === 'indeterminate' ? <MinusIcon /> : <CheckIcon />}
      </Primitive.Indicator>
    </Primitive.Root>
  );
}
