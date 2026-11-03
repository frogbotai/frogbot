'use client';

import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from 'react';

import { SearchInput } from './search-input.js';
import { Skeleton } from './skeleton.js';

export type CommandMenuItem = {
  /** Unique across every group. */
  id: string;
  label: ReactNode;
};

export type CommandMenuGroup = {
  id: string;
  items: CommandMenuItem[];
  label?: ReactNode;
  loading?: boolean;
};

export type CommandMenuSelectOptions = {
  /** Cmd on macOS, Ctrl elsewhere, was held. */
  meta: boolean;
};

export type CommandMenuProps = {
  className?: string;
  emptyText?: ReactNode;
  footer?: (active: CommandMenuItem | undefined) => ReactNode;
  groups: CommandMenuGroup[];
  label: string;
  onSelect: (item: CommandMenuItem, options: CommandMenuSelectOptions) => void;
  onValueChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

const LOADING_ROWS = 2;

/**
 * A search input over grouped options, with the combobox and listbox pattern: arrow keys move one
 * active option across every group while focus stays in the input. It filters nothing itself.
 */
export function CommandMenu({
  className,
  emptyText,
  footer,
  groups,
  label,
  onSelect,
  onValueChange,
  placeholder,
  value,
}: CommandMenuProps) {
  const listboxId = useId();
  const [activeId, setActiveId] = useState<string>();
  const items = groups.flatMap((group) => group.items);
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeId),
  );

  const active = items[activeIndex];
  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const activeOptionId = active ? optionId(activeIndex) : undefined;
  const loading = groups.some((group) => group.loading);

  useEffect(() => {
    if (activeOptionId) {
      document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [activeOptionId]);

  function move(offset: number) {
    if (!items.length) return;

    setActiveId(items[(activeIndex + offset + items.length) % items.length]?.id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && active) {
      event.preventDefault();
      onSelect(active, { meta: event.metaKey || event.ctrlKey });
    }
  }

  let offset = 0;

  return (
    <div className={`fb-command-menu${className ? ` ${className}` : ''}`}>
      <SearchInput
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded
        aria-label={label}
        autoComplete="off"
        className="fb-command-menu__input"
        placeholder={placeholder}
        role="combobox"
        spellCheck={false}
        type="text"
        value={value}
        onChange={(next) => {
          setActiveId(undefined);
          onValueChange(next);
        }}
        onKeyDown={onKeyDown}
      />
      <div aria-label={label} className="fb-command-menu__list" id={listboxId} role="listbox">
        {groups.map((group) => {
          const start = offset;

          offset += group.items.length;

          if (!group.items.length && !group.loading) return null;

          return (
            <div
              aria-busy={group.loading || undefined}
              aria-label={typeof group.label === 'string' ? group.label : undefined}
              className="fb-command-menu__group"
              key={group.id}
              role="group"
            >
              {group.label !== undefined && (
                <div aria-hidden="true" className="fb-command-menu__group-label">
                  {group.label}
                </div>
              )}
              {group.items.map((item, index) => {
                const flatIndex = start + index;
                const isActive = flatIndex === activeIndex;

                return (
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- the combobox input handles the keyboard; focus stays there
                  <div
                    aria-selected={isActive}
                    className={`fb-command-menu__item${isActive ? ' fb-command-menu__item--active' : ''}`}
                    id={optionId(flatIndex)}
                    key={item.id}
                    role="option"
                    tabIndex={-1}
                    onClick={(event: MouseEvent) =>
                      onSelect(item, { meta: event.metaKey || event.ctrlKey })
                    }
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => {
                      if (!isActive) setActiveId(item.id);
                    }}
                  >
                    {item.label}
                  </div>
                );
              })}
              {group.loading &&
                !group.items.length &&
                Array.from({ length: LOADING_ROWS }, (_, index) => (
                  <div aria-hidden="true" className="fb-command-menu__loading" key={index}>
                    <Skeleton className="fb-command-menu__skeleton" />
                  </div>
                ))}
            </div>
          );
        })}
        {!items.length && !loading && emptyText !== undefined && (
          <div aria-live="polite" className="fb-command-menu__empty" role="status">
            {emptyText}
          </div>
        )}
      </div>
      {footer && <div className="fb-command-menu__footer">{footer(active)}</div>}
    </div>
  );
}
