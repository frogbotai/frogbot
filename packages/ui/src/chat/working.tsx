import type { ReactNode } from 'react';

import FrogBotFavicon from '../icons/icons/FrogBotFavicon.js';

export interface WorkingIndicatorProps {
  /** The agent is working: the logo pulses and screen readers hear "Working". */
  active: boolean;
  /** The logo; defaults to the FrogBot favicon. */
  icon?: ReactNode;
}

/** A row below the thread that always keeps its height; its logo pulses while the agent works. */
export function WorkingIndicator({ active, icon }: WorkingIndicatorProps) {
  return (
    <div
      aria-hidden={active ? undefined : true}
      className="fb-working"
      data-active={active || undefined}
    >
      <span aria-hidden className="fb-working__logo">
        {icon ?? <FrogBotFavicon />}
      </span>
      <span className="fb-working__label" role="status">
        {active ? 'Working' : null}
      </span>
    </div>
  );
}
