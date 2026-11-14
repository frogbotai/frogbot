'use client';

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useState } from 'react';

import { useIsMobile } from '../hooks/use-mobile.js';
import { useNavAdapter } from './adapter.js';
import { AppSidebar, type AppSidebarProps } from './AppSidebar.js';
import { MobileNavToggle } from './MobileNavToggle.js';
import { getNavShellState } from './navShellState.js';
import { SidebarDrawerContext } from './sidebarState.js';

/** The key the shell saves its desktop open state under, as `{ open }`. */
export const NAV_PREFERENCE_KEY = 'nav';

export type NavShellProps = Omit<
  AppSidebarProps,
  'currentPath' | 'onNavigate' | 'onToggle' | 'open'
> & {
  /**
   * Replaces `AppSidebar`, such as a Settings sidebar. The rail then never collapses on desktop,
   * and the host's open state follows `initialOpen`, so `AppSidebar` returns as it was saved.
   */
  children?: ReactNode;
  /** The saved desktop state; the sidebar starts open without it. */
  initialOpen?: boolean;
  /** Extra classes for the scroll container, for a host layout that styles it. */
  scrollClassName?: string;
};

/**
 * `AppSidebar`, or the `children` that replace it, in a shell: a rail that collapses on desktop,
 * and a drawer with a backdrop and Escape below 768px. The shell renders its own drawer toggle
 * unless the host supplies `drawer`.
 */
export function NavShell({ children, initialOpen, scrollClassName, ...sidebar }: NavShellProps) {
  const { drawer: hostDrawer, navigate, pathname, preferences } = useNavAdapter();
  const [ownOpen, setOwnOpen] = useState(false);
  const drawer = hostDrawer ?? { open: ownOpen, setOpen: setOwnOpen, hydrated: true };
  const { hydrated, open: drawerOpen, ref, setOpen: setDrawerOpen } = drawer;
  const isMobile = useIsMobile();

  const [desktopOpen, setDesktopOpen] = useState(() =>
    hydrated && !isMobile && hostDrawer ? drawerOpen : (initialOpen ?? true),
  );

  const replaced = children !== undefined;
  const open = isMobile ? drawerOpen : replaced || desktopOpen;
  const navState = getNavShellState(isMobile, open);

  const hostOpen = replaced ? initialOpen : desktopOpen;

  useLayoutEffect(() => {
    if (hydrated && !isMobile && hostOpen !== undefined && drawerOpen !== hostOpen) {
      setDrawerOpen(hostOpen);
    }
  }, [hostOpen, hydrated, isMobile, drawerOpen, setDrawerOpen]);

  useEffect(() => {
    if (isMobile) setDrawerOpen(false);
  }, [isMobile, pathname, setDrawerOpen]);

  useEffect(() => {
    if (navState !== 'mobile-nav-open') return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };

    document.addEventListener('keydown', closeOnEscape);

    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [navState, setDrawerOpen]);

  const closeDrawer = useCallback(() => {
    if (isMobile) setDrawerOpen(false);
  }, [isMobile, setDrawerOpen]);

  return (
    <SidebarDrawerContext.Provider value={closeDrawer}>
      {!hostDrawer && <MobileNavToggle navState={navState} onOpen={() => setDrawerOpen(true)} />}
      {navState === 'mobile-nav-open' && (
        <div aria-hidden className="fb-nav-backdrop" onClick={() => setDrawerOpen(false)} />
      )}
      <aside
        className="fb-nav-shell"
        data-nav-hydrated={hydrated || undefined}
        data-nav-state={navState}
      >
        <div
          className={['fb-nav-shell__scroll', scrollClassName].filter(Boolean).join(' ')}
          ref={ref}
        >
          <div className="fb-nav">
            {children ?? (
              <AppSidebar
                {...sidebar}
                currentPath={pathname}
                onNavigate={navigate}
                onToggle={() => {
                  if (isMobile) {
                    setDrawerOpen(!drawerOpen);

                    return;
                  }

                  const next = !desktopOpen;

                  setDesktopOpen(next);
                  setDrawerOpen(next);
                  void preferences.set(NAV_PREFERENCE_KEY, { open: next });
                }}
                open={open}
              />
            )}
          </div>
        </div>
      </aside>
    </SidebarDrawerContext.Provider>
  );
}
