'use client';

import { useIsMobile } from '@frogbotai/ui';
import { MenuIcon } from '@frogbotai/ui/icons';

export type MobileNavToggleProps = {
  navOpen: boolean;
  onOpen: () => void;
};

export function MobileNavToggle({ navOpen, onOpen }: MobileNavToggleProps) {
  const isMobile = useIsMobile();

  if (!isMobile || navOpen) return null;

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
