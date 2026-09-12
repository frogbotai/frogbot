'use client';

import { useIsMobile } from '@frogbotai/ui';
import { useNav, usePreferences, useRouteTransition } from '@payloadcms/ui';
import { usePathname, useRouter } from 'next/navigation.js';
import { PREFERENCE_KEYS } from 'payload/shared';
import { type ReactNode, useEffect } from 'react';

import type { AppSidebarNavItem } from './AppSidebar.js';
import { AppSidebar } from './AppSidebar.js';
import { MobileNavToggle } from './MobileNavToggle.js';
import { getNavShellState } from './navShellState.js';

export type FrogbotNavClientProps = {
  accountEmail?: string;
  accountIcon?: ReactNode;
  accountName?: string;
  afterAccountMenu?: ReactNode;
  afterNavLinks?: ReactNode;
  afterBottomRail?: ReactNode;
  beforeAccountMenu?: ReactNode;
  beforeNavLinks?: ReactNode;
  beforeBottomRail?: ReactNode;
  beforeSidebarClose?: ReactNode;
  bottom?: ReactNode;
  accountPath: string;
  homePath: string;
  initialOpen?: boolean;
  items: AppSidebarNavItem[];
  logo?: ReactNode;
  logout?: ReactNode;
  logoutPath?: string;
  sections?: ReactNode;
  settingsPath: string;
};

export function FrogbotNavClient({
  accountEmail,
  accountIcon,
  accountName,
  accountPath,
  afterAccountMenu,
  afterBottomRail,
  afterNavLinks,
  beforeAccountMenu,
  beforeBottomRail,
  beforeNavLinks,
  beforeSidebarClose,
  bottom,
  homePath,
  initialOpen,
  items,
  logo,
  logout,
  logoutPath,
  sections,
  settingsPath,
}: FrogbotNavClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setPreference } = usePreferences();
  const { startRouteTransition } = useRouteTransition();
  const { hydrated, navOpen, navRef, setNavOpen } = useNav();
  const isMobile = useIsMobile();
  const navState = getNavShellState(isMobile, navOpen);

  useEffect(() => {
    if (!isMobile && initialOpen !== undefined) setNavOpen(initialOpen);
  }, [initialOpen, isMobile, setNavOpen]);

  useEffect(() => {
    if (isMobile) setNavOpen(false);
  }, [isMobile, pathname, setNavOpen]);

  useEffect(() => {
    if (navState !== 'mobile-nav-open') return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [navState, setNavOpen]);

  return (
    <>
      <MobileNavToggle navState={navState} onOpen={() => setNavOpen(true)} />
      {navState === 'mobile-nav-open' && (
        <div aria-hidden className="frogbot-nav-backdrop" onClick={() => setNavOpen(false)} />
      )}
      <aside
        className="frogbot-nav-shell"
        data-nav-hydrated={hydrated || undefined}
        data-nav-state={navState}
      >
        <div className="nav__scroll" ref={navRef}>
          <div className="frogbot-nav">
            <AppSidebar
              accountEmail={accountEmail}
              accountIcon={accountIcon}
              accountName={accountName}
              accountPath={accountPath}
              afterAccountMenu={afterAccountMenu}
              afterBottomRail={afterBottomRail}
              afterNavLinks={afterNavLinks}
              beforeAccountMenu={beforeAccountMenu}
              beforeBottomRail={beforeBottomRail}
              beforeNavLinks={beforeNavLinks}
              beforeSidebarClose={beforeSidebarClose}
              bottom={bottom}
              currentPath={pathname}
              homePath={homePath}
              logo={logo}
              logout={logout}
              logoutPath={logoutPath}
              navItems={items}
              onNavigate={(path) => {
                if (/^https?:\/\//.test(path)) window.location.assign(path);
                else startRouteTransition(() => router.push(path));
              }}
              onToggle={() => {
                const open = !navOpen;
                setNavOpen(open);
                void setPreference(PREFERENCE_KEYS.NAV, { open }, true);
              }}
              open={navOpen}
              sections={sections}
              settingsPath={settingsPath}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
