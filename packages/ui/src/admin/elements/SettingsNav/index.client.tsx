'use client';

import type { ReactNode } from 'react';

import ChevronLeftIcon from '../../../icons/icons/ChevronLeftIcon.js';
import ProfileIcon from '../../../icons/icons/ProfileIcon.js';
import { useNavAdapter } from '../../../nav/adapter.js';

export type SettingsNavItem = { href: string; icon: ReactNode; label: string };

export type SettingsNavProps = {
  accountHref: string;
  backHref: string;
  items: SettingsNavItem[];
};

/** The longest link that is the path or one of its parents, so a document lights its collection. */
export function getActiveSettingsHref(pathname: string, hrefs: readonly string[]) {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href.replace(/\/$/, '')}/`))
    .sort((a, b) => b.length - a.length)[0];
}

/** The Settings sidebar: a way back to the app, the Settings pages and the account. */
export function SettingsNav({ accountHref, backHref, items }: SettingsNavProps) {
  const { Link, pathname } = useNavAdapter();
  const active = getActiveSettingsHref(pathname, [...items.map(({ href }) => href), accountHref]);

  const renderItem = ({ href, icon, label }: SettingsNavItem) => (
    <Link
      aria-current={href === active ? 'page' : undefined}
      className={`frogbot-settings-nav__item${href === active ? ' frogbot-settings-nav__item--active' : ''}`}
      href={href}
      key={href}
    >
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
        {renderItem({ href: accountHref, icon: <ProfileIcon size={18} />, label: 'Account' })}
      </div>
    </div>
  );
}
