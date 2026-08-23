'use client';

import { useNav, usePreferences, useRouteTransition } from '@payloadcms/ui';
import { usePathname, useRouter } from 'next/navigation.js';
import { PREFERENCE_KEYS } from 'payload/shared';
import { type ReactNode, useEffect } from 'react';

import type { AppSidebarNavItem } from './AppSidebar.js';
import { AppSidebar } from './AppSidebar.js';

export type FrogbotNavClientProps = {
  accountIcon?: ReactNode;
  afterNavLinks?: ReactNode;
  afterBottomRail?: ReactNode;
  beforeNavLinks?: ReactNode;
  beforeBottomRail?: ReactNode;
  beforeSidebarClose?: ReactNode;
  bottom?: ReactNode;
  accountPath: string;
  homePath: string;
  initialOpen?: boolean;
  items: AppSidebarNavItem[];
  logo?: ReactNode;
  sections?: ReactNode;
  settingsPath: string;
};

export function FrogbotNavClient({
  accountIcon,
  accountPath,
  afterBottomRail,
  afterNavLinks,
  beforeBottomRail,
  beforeNavLinks,
  beforeSidebarClose,
  bottom,
  homePath,
  initialOpen,
  items,
  logo,
  sections,
  settingsPath,
}: FrogbotNavClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setPreference } = usePreferences();
  const { startRouteTransition } = useRouteTransition();
  const { hydrated, navOpen, navRef, setNavOpen, shouldAnimate } = useNav();

  useEffect(() => {
    if (initialOpen !== undefined) setNavOpen(initialOpen);
  }, [initialOpen, setNavOpen]);

  return (
    <aside
      className={[
        'nav frogbot-nav-shell',
        navOpen && 'nav--nav-open',
        shouldAnimate && 'nav--nav-animate',
        hydrated && 'nav--nav-hydrated',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="nav__scroll" ref={navRef}>
        <div className="frogbot-nav">
          <AppSidebar
            accountIcon={accountIcon}
            accountPath={accountPath}
            afterBottomRail={afterBottomRail}
            afterNavLinks={afterNavLinks}
            beforeBottomRail={beforeBottomRail}
            beforeNavLinks={beforeNavLinks}
            beforeSidebarClose={beforeSidebarClose}
            bottom={bottom}
            currentPath={pathname}
            homePath={homePath}
            logo={logo}
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
  );
}
