'use client';

import { memo } from 'react';

import { Button } from '../components/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/dropdown-menu.js';
import CheckIcon from '../icons/icons/CheckIcon.js';
import ChevronDownIcon from '../icons/icons/ChevronDownIcon.js';
import { type IconName, iconRegistry } from '../icons/registry.js';

/** One choice in a `ComposerSelect`. */
export type ComposerSelectOption = {
  value: string;
  label: string;
  /** A registry icon shown before the label. */
  icon?: IconName;
};

export type ComposerSelectProps = {
  value: string;
  options: readonly ComposerSelectOption[];
  onChange: (value: string) => void;
  'aria-label'?: string;
  className?: string;
};

function OptionIcon({ icon }: { icon?: IconName }) {
  if (!icon) return null;

  const Icon = iconRegistry[icon];

  return <Icon className="fb-composer-select__icon" aria-hidden="true" />;
}

/** A dropdown for the composer's start or end slot, such as an agent or mode picker. */
export const ComposerSelect = memo(function ComposerSelect({
  'aria-label': ariaLabel,
  className,
  onChange,
  options,
  value,
}: ComposerSelectProps) {
  const selected = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={ariaLabel}
          className={`fb-composer-select__trigger${className ? ` ${className}` : ''}`}
        >
          <OptionIcon icon={selected?.icon} />
          <span className="fb-composer-select__trigger-label">{selected?.label ?? value}</span>
          <ChevronDownIcon className="fb-composer-select__chevron" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="fb-composer-select__content">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className="fb-composer-select__item"
          >
            <span className="fb-composer-select__item-option">
              <OptionIcon icon={option.icon} />
              <span className="fb-composer-select__item-label">{option.label}</span>
            </span>
            {option.value === value ? (
              <CheckIcon className="fb-composer-select__check" strokeWidth={4} />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
