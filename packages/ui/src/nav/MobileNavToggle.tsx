'use client';

import SidebarRightIcon from '../icons/icons/SidebarRightIcon.js';
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
      className="fb-mobile-nav-toggle"
      onClick={onOpen}
      type="button"
    >
      <SidebarRightIcon className="fb-sidebar-toggle-icon" size={20} />
    </button>
  );
}
