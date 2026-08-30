'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@frogbotai/ui';
import { LogoutRightIcon, SettingIcon } from '@frogbotai/ui/icons';
import { type ComponentType, createElement, isValidElement, type ReactNode } from 'react';

export type AccountMenuIcon = ComponentType<{ className?: string; size?: number }> | ReactNode;

export type AccountMenuItemProps = {
  icon?: AccountMenuIcon;
  label: string;
  onSelect: () => void;
};

export type AccountMenuProps = {
  accountPath: string;
  afterMenuItems?: ReactNode;
  avatar?: ReactNode;
  beforeMenuItems?: ReactNode;
  children: ReactNode;
  email?: string;
  logout?: ReactNode;
  logoutPath?: string;
  name?: string;
  onNavigate: (path: string) => void;
  settingsPath: string;
};

const baseClass = 'frogbot-account-menu';

const renderIcon = (icon: AccountMenuIcon | undefined) => {
  if (!icon) return null;
  if (isValidElement(icon)) {
    return <span className={`${baseClass}__item-icon`}>{icon}</span>;
  }
  return createElement(icon as ComponentType<{ className?: string; size?: number }>, {
    className: `${baseClass}__item-icon`,
    size: 20,
  });
};

export function AccountMenuItem({ icon, label, onSelect }: AccountMenuItemProps) {
  return (
    <DropdownMenuItem className={`${baseClass}__item fb-slide-right-1`} onSelect={() => onSelect()}>
      {renderIcon(icon)}
      <span className={`${baseClass}__item-label`}>{label}</span>
    </DropdownMenuItem>
  );
}

export function AccountMenu({
  accountPath,
  afterMenuItems,
  avatar,
  beforeMenuItems,
  children,
  email,
  logout,
  logoutPath,
  name,
  onNavigate,
  settingsPath,
}: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={baseClass} side="top" sideOffset={8}>
        <DropdownMenuItem
          className={`${baseClass}__header fb-slide-right-1`}
          onSelect={() => onNavigate(accountPath)}
        >
          {avatar && <span className={`${baseClass}__avatar`}>{avatar}</span>}
          <div className={`${baseClass}__identity`}>
            <span className={`${baseClass}__name`}>{name || 'Account'}</span>
            {email && <span className={`${baseClass}__email`}>{email}</span>}
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator className={`${baseClass}__separator`} />
        {beforeMenuItems}
        <AccountMenuItem
          icon={SettingIcon}
          label="Settings"
          onSelect={() => onNavigate(settingsPath)}
        />
        {afterMenuItems}
        {(logout || logoutPath) && <DropdownMenuSeparator className={`${baseClass}__separator`} />}
        {logout ??
          (logoutPath && (
            <AccountMenuItem
              icon={LogoutRightIcon}
              label="Log out"
              onSelect={() => onNavigate(logoutPath)}
            />
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
