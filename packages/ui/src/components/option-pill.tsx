import type { OptionColor } from 'frogbot';
import type { ComponentProps } from 'react';

export type OptionPillProps = Omit<ComponentProps<'span'>, 'color'> & { color: OptionColor };

export function OptionPill({ className, color, ...props }: OptionPillProps) {
  return (
    <span
      className={`fb-option-pill fb-option-pill--${color}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
