'use client';

import {
  type ComponentType,
  createElement,
  isValidElement,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import FolderIcon from '../icons/icons/FolderIcon.js';
import FrogBotFavicon from '../icons/icons/FrogBotFavicon.js';
import SidebarLeftIcon from '../icons/icons/SidebarLeftIcon.js';
import { type IconName, iconRegistry, isIconName } from '../icons/registry.js';
import { PortalTheme } from '../theme/provider.js';
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
  const [tooltip, setTooltip] = useState<{ label: string; left: number; top: number } | null>(null);
  const caretClip = useId();
  const bubble = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setStripHovered(false);
    setTooltip(null);
    if (!open) {
      setLabelsVisible(false);

      return;
    }

    const timeout = setTimeout(() => setLabelsVisible(true), 100);

    return () => clearTimeout(timeout);
  }, [open]);

  useLayoutEffect(() => {
    const element = bubble.current;

    if (!tooltip || !element) return;

    const { height, width } = element.getBoundingClientRect();

    element.style.left = `${tooltip.left - width / 2}px`;
    element.style.top = `${tooltip.top - height - 10}px`;
  }, [tooltip]);

  const navigate = (event: MouseEvent, path: string) => {
    event.stopPropagation();
    onNavigate(path);
  };

  const tooltipHandlers = (label: string) =>
    open
      ? {}
      : {
          onMouseEnter: (event: MouseEvent<HTMLElement>) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setTooltip({ label, left: rect.right, top: rect.top + rect.height / 2 });
          },
          onMouseLeave: () => setTooltip(null),
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
      <button
        aria-label={item.label}
        className={classes(
          `${baseClass}__item`,
          'fb-slide-right-1',
          active && `${baseClass}__item--active`,
        )}
        key={item.path}
        onClick={(event) => navigate(event, item.path)}
        type="button"
        {...tooltipHandlers(item.label)}
      >
        {isValidElement(Icon)
          ? Icon
          : createElement(Icon as ComponentType<{ className?: string; size: number }>, {
              className: `${baseClass}__icon`,
              size: 24,
            })}
        {labelsVisible && <span className={`${baseClass}__label`}>{item.label}</span>}
      </button>
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
          {...tooltipHandlers('Open sidebar')}
        >
          {showToggleIcon ? <SidebarLeftIcon size={20} /> : logo || <FrogBotFavicon size={40} />}
        </button>
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
        onClick={open ? (event) => event.stopPropagation() : undefined}
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
            <button
              aria-label="Account"
              className={classes(`${baseClass}__item`, 'fb-slide-right-1')}
              onClick={(event) => event.stopPropagation()}
              type="button"
              {...tooltipHandlers('Account')}
            >
              {isValidElement(accountIcon) ? (
                accountIcon
              ) : (
                <FolderIcon className={`${baseClass}__icon`} size={24} />
              )}
              {labelsVisible && (
                <span className={`${baseClass}__label`}>{accountName || 'Account'}</span>
              )}
            </button>
          </AccountMenu>
        )}
        {bottom}
        {afterBottomRail}
      </div>

      {tooltip &&
        createPortal(
          <PortalTheme>
            <div
              className={`${baseClass}__tooltip`}
              style={{ left: tooltip.left, top: tooltip.top }}
            >
              <span className={`${baseClass}__tooltip-bubble`} ref={bubble} role="tooltip">
                <span className={`${baseClass}__tooltip-label`}>{tooltip.label}</span>
                <svg
                  aria-hidden="true"
                  className={`${baseClass}__tooltip-caret`}
                  height="14"
                  viewBox="0 0 14 14"
                  width="15"
                >
                  <clipPath id={caretClip}>
                    <rect height="14" width="15" x="-0.5" y="0.5" />
                  </clipPath>
                  <path
                    className={`${baseClass}__tooltip-caret-stroke`}
                    clipPath={`url(#${caretClip})`}
                    d="M0,0 H14 L7.875,6.125 Q7,7 6.125,6.125 Z"
                  />
                  <path
                    className={`${baseClass}__tooltip-caret-fill`}
                    d="M0,0 H14 L7.875,6.125 Q7,7 6.125,6.125 Z"
                  />
                </svg>
              </span>
            </div>
          </PortalTheme>,
          document.body,
        )}
    </div>
  );
}
