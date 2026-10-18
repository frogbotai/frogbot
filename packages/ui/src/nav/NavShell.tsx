'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

import { useIsMobile } from '../hooks/use-mobile.js';
import { useNavAdapter } from './adapter.js';
import { AppSidebar, type AppSidebarProps } from './AppSidebar.js';
import { MobileNavToggle } from './MobileNavToggle.js';
import { getNavShellState } from './navShellState.js';

/** The key the shell saves its desktop open state under, as `{ open }`. */
export const NAV_PREFERENCE_KEY = 'nav';

export type NavShellProps = Omit<
  AppSidebarProps,
  'currentPath' | 'onNavigate' | 'onToggle' | 'open'
> & {
  /** The saved desktop state; the sidebar starts open without it. */
  initialOpen?: boolean;
  /** Extra classes for the scroll container, for a host layout that styles it. */
  scrollClassName?: string;
};

/**
 * `AppSidebar` in a shell: a rail that collapses on desktop, and a drawer with a backdrop, a
 * toggle and Escape below 768px.
 */
export function NavShell({ initialOpen, scrollClassName, ...sidebar }: NavShellProps) {
  const { drawer: hostDrawer, navigate, pathname, preferences } = useNavAdapter();
  const [ownOpen, setOwnOpen] = useState(false);
  const drawer = hostDrawer ?? { open: ownOpen, setOpen: setOwnOpen, hydrated: true };
  const { hydrated, open: drawerOpen, ref, setOpen: setDrawerOpen } = drawer;
  const isMobile = useIsMobile();

  const [desktopOpen, setDesktopOpen] = useState(() =>
    hydrated && !isMobile && hostDrawer ? drawerOpen : (initialOpen ?? true),
  );

  const open = isMobile ? drawerOpen : desktopOpen;
  const navState = getNavShellState(isMobile, open);

  useLayoutEffect(() => {
    if (hydrated && !isMobile && drawerOpen !== desktopOpen) setDrawerOpen(desktopOpen);
  }, [desktopOpen, hydrated, isMobile, drawerOpen, setDrawerOpen]);

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

  return (
    <>
      <MobileNavToggle navState={navState} onOpen={() => setDrawerOpen(true)} />
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
          </div>
        </div>
      </aside>
    </>
  );
}
