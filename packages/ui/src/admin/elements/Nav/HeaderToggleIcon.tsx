'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import SidebarRightIcon from '../../../icons/icons/SidebarRightIcon.js';

const slotSelector = '.app-header__sidebar-toggle .btn__icon';

/**
 * Draws the sidebar's "open" icon inside Payload's header toggle, which opens the phone drawer, so
 * every control that opens the sidebar shows the same picture.
 */
export function HeaderToggleIcon({ pathname }: { pathname: string }) {
  const [slot, setSlot] = useState<Element | null>(null);

  useEffect(() => {
    setSlot(document.querySelector(slotSelector));
  }, [pathname]);

  if (!slot?.isConnected) return null;

  return createPortal(<SidebarRightIcon className="fb-sidebar-toggle-icon" size={20} />, slot);
}
