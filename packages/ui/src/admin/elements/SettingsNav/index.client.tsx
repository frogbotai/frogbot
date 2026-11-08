'use client';

import type { ReactNode } from 'react';

import ChevronLeftIcon from '../../../icons/icons/ChevronLeftIcon.js';
import ProfileIcon from '../../../icons/icons/ProfileIcon.js';
import { AccountMenu, type AccountMenuProps } from '../../../nav/AccountMenu.js';
import { useNavAdapter } from '../../../nav/adapter.js';

export type SettingsNavItem = { href: string; icon: ReactNode; label: string };

export type SettingsNavProps = Pick<AccountMenuProps, 'logout' | 'logoutPath'> & {
  accountHref: string;
  afterAccountMenu?: ReactNode;
  backHref: string;
  beforeAccountMenu?: ReactNode;
  items: SettingsNavItem[];
};

/** The longest link that is the path or one of its parents, so a document lights its collection. */
export function getActiveSettingsHref(pathname: string, hrefs: readonly string[]) {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href.replace(/\/$/, '')}/`))
    .sort((a, b) => b.length - a.length)[0];
}

/** The Settings sidebar: a way back to the app, the Settings pages and the account menu. */
export function SettingsNav({
  accountHref,
  afterAccountMenu,
  backHref,
  beforeAccountMenu,
  items,
  logout,
  logoutPath,
}: SettingsNavProps) {
  const { Link, navigate, pathname } = useNavAdapter();
  const active = getActiveSettingsHref(pathname, [...items.map(({ href }) => href), accountHref]);

  const itemProps = (href: string) => ({
    'aria-current': href === active ? ('page' as const) : undefined,
    className: `frogbot-settings-nav__item${href === active ? ' frogbot-settings-nav__item--active' : ''}`,
  });

  const renderItem = ({ href, icon, label }: SettingsNavItem) => (
    <Link {...itemProps(href)} href={href} key={href}>
      <span className="frogbot-settings-nav__icon">{icon}</span>
      {label}
    </Link>
  );

  return (
    <div className="frogbot-settings-nav">
      <Link className="frogbot-settings-nav__back" href={backHref}>
        <ChevronLeftIcon size={18} />
        Back to app
      </Link>
      <p className="frogbot-settings-nav__heading">Settings</p>
      <nav aria-label="Settings" className="frogbot-settings-nav__items">
        {items.map(renderItem)}
      </nav>
      <div className="frogbot-settings-nav__footer">
        <AccountMenu
          accountPath={accountHref}
          afterMenuItems={afterAccountMenu}
          beforeMenuItems={beforeAccountMenu}
          logout={logout}
          logoutPath={logoutPath}
          onNavigate={navigate}
        >
          <button {...itemProps(accountHref)} type="button">
            <span className="frogbot-settings-nav__icon">
              <ProfileIcon size={18} />
            </span>
            Account
          </button>
        </AccountMenu>
      </div>
    </div>
  );
}
