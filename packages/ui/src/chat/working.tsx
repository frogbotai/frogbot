'use client';

import { type ReactNode, useEffect, useState } from 'react';

import FrogBotFavicon from '../icons/icons/FrogBotFavicon.js';

export interface WorkingIndicatorProps {
  /** The agent is working: the logo pulses and screen readers hear "Working". */
  active: boolean;
  /** The logo; defaults to the FrogBot favicon. */
  icon?: ReactNode;
}

/**
 * A row below the thread that always keeps its height; its logo pulses while the agent works.
 * The status region is always exposed and gets its text only after it is in the tree, so
 * screen readers announce "Working" once per run.
 */
export function WorkingIndicator({ active, icon }: WorkingIndicatorProps) {
  const [announced, setAnnounced] = useState(false);

  useEffect(() => setAnnounced(active), [active]);

  return (
    <div className="fb-working" data-active={active || undefined}>
      <span aria-hidden className="fb-working__logo">
        {icon ?? <FrogBotFavicon />}
      </span>
      <span className="fb-working__label" role="status">
        {active && announced ? 'Working' : null}
      </span>
    </div>
  );
}
