'use client';

import { useNav, usePreferences, useRouteTransition } from '@payloadcms/ui';
import { usePathname, useRouter } from 'next/navigation.js';
import { PREFERENCE_KEYS } from 'payload/shared';
import { type ReactNode, useEffect } from 'react';

import type { NavItem, NavItemGroup } from './AppSidebar.js';
import { AppSidebar } from './AppSidebar.js';

export type FrogbotNavClientProps = {
  afterNavLinks?: ReactNode;
  beforeNavLinks?: ReactNode;
  bottom?: ReactNode;
  groups: NavItemGroup[];
  homePath: string;
  initialOpen?: boolean;
  items: NavItem[];
  logo?: ReactNode;
};

export function FrogbotNavClient({
  afterNavLinks,
  beforeNavLinks,
  bottom,
  groups,
  homePath,
  initialOpen,
  items,
  logo,
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
            afterNavLinks={afterNavLinks}
            beforeNavLinks={beforeNavLinks}
            bottom={bottom}
            currentPath={pathname}
            groups={groups}
            homePath={homePath}
            logo={logo}
            navItems={items}
            onGroupToggle={(label, open) => {
              void setPreference(PREFERENCE_KEYS.NAV, { groups: { [label]: { open } } }, true);
            }}
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
          />
        </div>
      </div>
    </aside>
  );
}
