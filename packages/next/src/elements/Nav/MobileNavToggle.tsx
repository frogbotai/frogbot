'use client';

import { MenuIcon } from '@frogbotai/ui/icons';

import type { NavShellState } from './navShellState.js';

export type MobileNavToggleProps = {
  navState: NavShellState;
  onOpen: () => void;
};

export function MobileNavToggle({ navState, onOpen }: MobileNavToggleProps) {
  if (navState !== 'mobile-nav-closed') return null;

  return (
    <button
      aria-label="Open navigation"
      className="frogbot-mobile-nav-toggle"
      onClick={onOpen}
      type="button"
    >
      <MenuIcon size={24} />
    </button>
  );
}
