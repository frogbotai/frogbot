import { ChevronLeftIcon, ProfileIcon } from '@frogbotai/ui/icons';
import { Link } from '@payloadcms/ui';
import { formatAdminURL } from 'payload/shared';
import type { ReactNode } from 'react';

export type SettingsNavEntry = {
  icon: ReactNode;
  label: string;
  path: string;
};

type SettingsNavProps = {
  accountPath: string;
  activePath: string;
  adminRoute: string;
  entries: SettingsNavEntry[];
};

export function SettingsNav({ accountPath, activePath, adminRoute, entries }: SettingsNavProps) {
  return (
    <aside className="frogbot-settings-nav">
      <Link className="frogbot-settings-nav__back" href={adminRoute}>
        <ChevronLeftIcon size={18} />
        Back to app
      </Link>
      <p className="frogbot-settings-nav__heading">Settings</p>
      <nav className="frogbot-settings-nav__items">
        {entries.map((entry) => {
          const active = activePath === entry.path || activePath.startsWith(`${entry.path}/`);

          return (
            <Link
              aria-current={active ? 'page' : undefined}
              className={`frogbot-settings-nav__item${active ? ' frogbot-settings-nav__item--active' : ''}`}
              href={formatAdminURL({ adminRoute, path: `/settings/${entry.path}` })}
              key={entry.path}
            >
              <span className="frogbot-settings-nav__icon">{entry.icon}</span>
              {entry.label}
            </Link>
          );
        })}
      </nav>
      <div className="frogbot-settings-nav__footer">
        <Link className="frogbot-settings-nav__item" href={accountPath}>
          <span className="frogbot-settings-nav__icon">
            <ProfileIcon size={18} />
          </span>
          Account
        </Link>
      </div>
    </aside>
  );
}
