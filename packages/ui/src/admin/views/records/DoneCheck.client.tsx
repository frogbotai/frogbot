'use client';

import type { PointerEvent } from 'react';

import CheckmarkCircleIcon from '../../../icons/icons/CheckmarkCircleIcon.js';

/** The check circle on a card that marks its record done, read-only without update access. */
export function DoneCheck({
  disabled,
  done,
  onToggle,
}: {
  disabled: boolean;
  done: boolean;
  onToggle: (done: boolean) => void;
}) {
  const stop = (event: PointerEvent) => event.stopPropagation();

  return (
    <button
      aria-label={done ? 'Completed' : 'Mark complete'}
      aria-pressed={done}
      className={`fb-done-check${done ? ' fb-done-check--done' : ''}`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(!done);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={stop}
      type="button"
    >
      <CheckmarkCircleIcon aria-hidden size={18} />
    </button>
  );
}
