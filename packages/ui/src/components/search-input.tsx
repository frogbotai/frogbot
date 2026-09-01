import type { ChangeEvent, ComponentProps } from 'react';

import AiSearchIcon from '../icons/icons/AiSearchIcon.js';
import XIcon from '../icons/icons/XIcon.js';
export type SearchInputProps = Omit<ComponentProps<'input'>, 'onChange'> & {
  onChange: (value: string) => void;
};
export function SearchInput({ className, onChange, value, ...props }: SearchInputProps) {
  return (
    <div className={`fb-search-input${className ? ` ${className}` : ''}`}>
      <AiSearchIcon className="fb-search-input__icon" />
      <input
        className="fb-search-input__control"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        {...props}
      />
      {value !== '' && value !== undefined && (
        <button
          type="button"
          className="fb-search-input__clear"
          aria-label="Clear"
          onClick={() => onChange('')}
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}
