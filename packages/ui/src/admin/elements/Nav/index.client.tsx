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
import type { PaletteModel } from '../CommandPalette/buildPaletteModel.js';
import { RecordPalette } from '../CommandPalette/index.client.js';
import { SettingsNav, type SettingsNavProps } from '../SettingsNav/index.client.js';

export type FrogBotNavClientProps = Omit<
  NavShellProps,
  'accountIcon' | 'children' | 'navItems' | 'scrollClassName'
> & {
  accountPath: string;
  CustomAvatar?: ReactNode;
  items: NonNullable<NavShellProps['navItems']>;
  palette: PaletteModel;
  settingsPath: string;
};

export type FrogBotSettingsNavClientProps = SettingsNavProps & { palette: PaletteModel };

function PayloadLink(props: NavLinkProps) {
  return <Link {...props} prefetch={false} />;
}

function PayloadNavAdapter({ children }: { children: ReactNode }) {
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
      {children}
    </NavAdapterProvider>
  );
}

/** FrogBot's sidebar on Payload's router, preferences and nav state. */
export function FrogBotNavClient({
  CustomAvatar,
  items,
  palette,
  ...props
}: FrogBotNavClientProps) {
  return (
    <PayloadNavAdapter>
      <NavShell
        {...props}
        accountIcon={CustomAvatar !== undefined ? CustomAvatar : <Account />}
        navItems={items}
        scrollClassName="nav__scroll"
      />
      <RecordPalette {...palette} />
    </PayloadNavAdapter>
  );
}

/** The Settings sidebar in the same shell and drawer as FrogBot's sidebar. */
export function FrogBotSettingsNavClient({ palette, ...settings }: FrogBotSettingsNavClientProps) {
  return (
    <PayloadNavAdapter>
      <NavShell homePath={settings.backHref} scrollClassName="nav__scroll">
        <SettingsNav {...settings} />
      </NavShell>
      <RecordPalette {...palette} />
    </PayloadNavAdapter>
  );
}
