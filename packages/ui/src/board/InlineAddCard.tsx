'use client';

import type { KeyboardEvent } from 'react';
import { useEffect, useRef } from 'react';

import PlusSignIcon from '../icons/icons/PlusSignIcon.js';

/** Props for a card typed straight into a board column. */
export type InlineAddCardProps = {
  error?: string;
  label?: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onOpenForm?: () => void;
  /** Saves the card; `next` is true when Enter asks for another empty card after it. */
  onSubmit: (next: boolean) => void;
  saving?: boolean;
  value: string;
};

/**
 * A temporary card with a focused title input. Enter saves and asks for the next card, Escape
 * discards, and blur saves text or removes an empty card.
 */
export function InlineAddCard({
  error,
  label = 'Card title',
  onCancel,
  onChange,
  onOpenForm,
  onSubmit,
  saving = false,
  value,
}: InlineAddCardProps) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saving || error) return;

    input.current?.focus();
    input.current?.scrollIntoView({ block: 'nearest' });
  }, [error, saving]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Enter') {
      event.preventDefault();

      if (value.trim()) onSubmit(true);
      else onCancel();
    }
  };

  return (
    <div
      aria-busy={saving}
      className={`frog-board__inline frog-board__card${error ? ' frog-board__inline--error' : ''}`}
    >
      <input
        aria-invalid={Boolean(error)}
        aria-label={label}
        className="frog-board__inline-input"
        onBlur={() => {
          if (saving || error) return;
          if (value.trim()) onSubmit(false);
          else onCancel();
        }}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Write a title"
        readOnly={saving}
        ref={input}
        value={value}
      />
      {error ? (
        <div className="frog-board__inline-error" role="alert">
          <span>{error}</span>
          <span className="frog-board__inline-actions">
            {onOpenForm ? (
              <button className="frog-board__inline-action" onClick={onOpenForm} type="button">
                Open form
              </button>
            ) : null}
            <button className="frog-board__inline-action" onClick={onCancel} type="button">
              Discard
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** The "+ Add" control at the foot of a board column. */
export function BoardAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      aria-label={`Add a card to ${label}`}
      className="frog-board__add"
      onClick={onClick}
      type="button"
    >
      <PlusSignIcon aria-hidden size={16} />
      Add
    </button>
  );
}
