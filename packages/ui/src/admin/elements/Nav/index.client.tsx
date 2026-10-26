'use client';

import {
  Account,
  Link,
  useNav,
  usePathname,
  usePreferences,
  useRouter,
  useRouteTransition,
} from '@payloadcms/ui';
import { PREFERENCE_KEYS } from 'payload/shared';
import type { ReactNode } from 'react';

import { NavAdapterProvider, type NavLinkProps } from '../../../nav/adapter.js';
import { NavShell, type NavShellProps } from '../../../nav/NavShell.js';

export type FrogBotNavClientProps = Omit<
  NavShellProps,
  'accountIcon' | 'navItems' | 'scrollClassName'
> & {
  accountPath: string;
  CustomAvatar?: ReactNode;
  items: NonNullable<NavShellProps['navItems']>;
  settingsPath: string;
};

function PayloadLink(props: NavLinkProps) {
  return <Link {...props} prefetch={false} />;
}

/** FrogBot's sidebar on Payload's router, preferences and nav state. */
export function FrogBotNavClient({ CustomAvatar, items, ...props }: FrogBotNavClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { getPreference, setPreference } = usePreferences();
  const { startRouteTransition } = useRouteTransition();
  const { hydrated, navOpen, navRef, setNavOpen } = useNav();

  return (
    <NavAdapterProvider
      Link={PayloadLink}
      drawer={{ hydrated, open: navOpen, ref: navRef, setOpen: setNavOpen }}
      navigate={(path) => {
        if (/^https?:\/\//.test(path)) window.location.assign(path);
        else void startRouteTransition(() => router.push(path));
      }}
      pathname={pathname}
      preferences={{
        get: (key) => getPreference(key),
        set: (key, value) => setPreference(key, value, key === PREFERENCE_KEYS.NAV),
      }}
    >
      <NavShell
        {...props}
        accountIcon={CustomAvatar !== undefined ? CustomAvatar : <Account />}
        navItems={items}
        scrollClassName="nav__scroll"
      />
    </NavAdapterProvider>
  );
}
