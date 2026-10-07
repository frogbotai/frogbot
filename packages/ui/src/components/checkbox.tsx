'use client';
import * as Primitive from '@radix-ui/react-checkbox';
import type { ComponentProps } from 'react';

import CheckIcon from '../icons/icons/CheckIcon.js';
import MinusIcon from '../icons/icons/MinusIcon.js';

export type CheckboxProps = Omit<ComponentProps<typeof Primitive.Root>, 'asChild'> & {
  variant?: 'primary' | 'secondary';
};

export function Checkbox(input: CheckboxProps) {
  const {
    asChild: _asChild,
    className,
    variant = 'primary',
    ...props
  } = input as CheckboxProps & ComponentProps<typeof Primitive.Root>;

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
