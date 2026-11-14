'use client';

import { commandPaletteSlug, useModal } from '@payloadcms/ui';
import { useSyncExternalStore } from 'react';

import { Shortcut } from '../../../components/shortcut.js';
import { Tooltip } from '../../../components/tooltip.js';
import SearchIcon from '../../../icons/icons/SearchIcon.js';
import { useSidebarState } from '../../../nav/sidebarState.js';

const subscribeNever = () => () => {};

/**
 * A sidebar item that opens the command palette, for `admin.components.beforeNavLinks` or
 * `afterNavLinks`. It shows its label and the Cmd+K hint while the sidebar is open, an icon with a
 * tooltip while it is collapsed, and closes the phone drawer when it opens the palette.
 */
export function SearchButton() {
  const { openModal } = useModal();
  const { closeDrawer, labelsVisible, open } = useSidebarState();
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  return (
    <Tooltip delay={0} disabled={open} label="Search" side="right">
      <button
        aria-keyshortcuts="Meta+K Control+K"
        aria-label="Search"
        className="fb-app-sidebar__item fb-slide-right-1"
        onClick={(event) => {
          event.stopPropagation();
          closeDrawer();
          openModal(commandPaletteSlug);
        }}
        type="button"
      >
        <SearchIcon className="fb-app-sidebar__icon" size={24} />
        {labelsVisible && <span className="fb-app-sidebar__label">Search</span>}
        {labelsVisible && hydrated && (
          <Shortcut className="fb-app-sidebar__shortcut" shortcutKey="K" withCtrl />
        )}
      </button>
    </Tooltip>
  );
}
