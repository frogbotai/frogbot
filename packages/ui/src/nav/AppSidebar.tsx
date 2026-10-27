'use client';

import {
  type ComponentType,
  createElement,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useState,
} from 'react';

import { Tooltip } from '../components/tooltip.js';
import FolderIcon from '../icons/icons/FolderIcon.js';
import FrogBotFavicon from '../icons/icons/FrogBotFavicon.js';
import SidebarLeftIcon from '../icons/icons/SidebarLeftIcon.js';
import { type IconName, iconRegistry, isIconName } from '../icons/registry.js';
import { isRenderableNode } from '../lib/isRenderableNode.js';
import { AccountMenu } from './AccountMenu.js';

export type AppSidebarNavItem = {
  icon?: ComponentType<{ className?: string; size: number }> | IconName | ReactNode;
  label: string;
  path: string;
};

export type AppSidebarProps = {
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
  currentPath: string;
  homePath: string;
  logo?: ReactNode;
  logout?: ReactNode;
  logoutPath?: string;
  navItems?: AppSidebarNavItem[];
  /** The account page; without it the bottom rail has no account menu. */
  accountPath?: string;
  sections?: ReactNode;
  settingsPath?: string;
  onNavigate: (path: string) => void;
  onToggle: () => void;
  open: boolean;
};

const baseClass = 'fb-app-sidebar';

const classes = (...values: (false | string | undefined)[]) => values.filter(Boolean).join(' ');

export function AppSidebar({
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
  currentPath,
  homePath,
  logo,
  logout,
  logoutPath,
  navItems = [],
  onNavigate,
  onToggle,
  open,
  sections,
  settingsPath,
}: AppSidebarProps) {
  const [labelsVisible, setLabelsVisible] = useState(open);
  const [stripHovered, setStripHovered] = useState(false);

  useEffect(() => {
    setStripHovered(false);
    if (!open) {
      setLabelsVisible(false);

      return;
    }

    const timeout = setTimeout(() => setLabelsVisible(true), 100);

    return () => clearTimeout(timeout);
  }, [open]);

  const navigate = (event: MouseEvent, path: string) => {
    event.stopPropagation();
    onNavigate(path);
  };

  const renderItem = (item: AppSidebarNavItem) => {
    const Icon =
      typeof item.icon === 'string'
        ? isIconName(item.icon)
          ? iconRegistry[item.icon]
          : FolderIcon
        : (item.icon ?? FolderIcon);

    const active =
      item.path === homePath
        ? currentPath === item.path
        : currentPath === item.path ||
          (item.path !== '/' && currentPath.startsWith(`${item.path}/`));

    return (
      <Tooltip delay={0} disabled={open} label={item.label} side="right" key={item.path}>
        <button
          aria-label={item.label}
          className={classes(
            `${baseClass}__item`,
            'fb-slide-right-1',
            active && `${baseClass}__item--active`,
          )}
          onClick={(event) => navigate(event, item.path)}
          type="button"
        >
          {isRenderableNode(Icon)
            ? Icon
            : createElement(Icon as ComponentType<{ className?: string; size: number }>, {
                className: `${baseClass}__icon`,
                size: 24,
              })}
          {labelsVisible && <span className={`${baseClass}__label`}>{item.label}</span>}
        </button>
      </Tooltip>
    );
  };

  const showToggleIcon = !open && stripHovered;

  return (
    <div
      className={classes(baseClass, !open && `${baseClass}--collapsed`)}
      data-collapsed={!open}
      onClick={!open ? onToggle : undefined}
      onMouseEnter={() => setStripHovered(true)}
      onMouseLeave={() => setStripHovered(false)}
      role="presentation"
    >
      <div className={`${baseClass}__header`}>
        <Tooltip delay={0} disabled={open} label="Open sidebar" side="right">
          <button
            aria-label={open ? 'Home' : 'Open sidebar'}
            className={classes(
              `${baseClass}__logo`,
              'fb-slide-right-1',
              showToggleIcon && `${baseClass}__logo--toggle`,
            )}
            onClick={(event) => {
              if (!open) return;
              navigate(event, homePath);
            }}
            type="button"
          >
            {showToggleIcon ? <SidebarLeftIcon size={20} /> : logo || <FrogBotFavicon size={40} />}
          </button>
        </Tooltip>
        {labelsVisible && (
          <div className={`${baseClass}__header-controls`}>
            {beforeSidebarClose}
            <button
              aria-label="Close sidebar"
              className={`${baseClass}__collapse fb-slide-left-1`}
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
              type="button"
            >
              <SidebarLeftIcon size={20} />
            </button>
          </div>
        )}
      </div>

      <nav className={`${baseClass}__nav`}>
        {beforeNavLinks}
        {navItems.map(renderItem)}
        {open && sections}
        {afterNavLinks}
      </nav>

      <div className={`${baseClass}__spacer`} />
      <div
        className={`${baseClass}__bottom`}
        onClick={(event) => event.stopPropagation()}
        role="presentation"
      >
        {beforeBottomRail}
        {accountPath && (
          <AccountMenu
            accountPath={accountPath}
            afterMenuItems={afterAccountMenu}
            avatar={accountIcon}
            beforeMenuItems={beforeAccountMenu}
            email={accountEmail}
            logout={logout}
            logoutPath={logoutPath}
            name={accountName}
            onNavigate={onNavigate}
            settingsPath={settingsPath}
          >
            <Tooltip delay={0} disabled={open} label="Account" side="right">
              <button
                aria-label="Account"
                className={classes(`${baseClass}__item`, 'fb-slide-right-1')}
                onClick={(event) => event.stopPropagation()}
                type="button"
              >
                {accountIcon != null ? (
                  accountIcon
                ) : (
                  <FolderIcon className={`${baseClass}__icon`} size={24} />
                )}
                {labelsVisible && (
                  <span className={`${baseClass}__label`}>{accountName || 'Account'}</span>
                )}
              </button>
            </Tooltip>
          </AccountMenu>
        )}
        {bottom}
        {afterBottomRail}
      </div>
    </div>
  );
}
