'use client';

import { FolderIcon, FrogBotFavicon, SidebarLeftIcon } from '@frogbotai/ui/icons';
import { Tooltip } from '@payloadcms/ui/elements/Tooltip';
import {
  type ComponentType,
  createElement,
  isValidElement,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

export type NavItem = {
  icon?: ComponentType<{ className?: string; size: number }> | ReactNode;
  label: string;
  path: string;
};

export type NavItemGroup = {
  items: NavItem[];
  label: string;
  open?: boolean;
};

export type AppSidebarProps = {
  afterNavLinks?: ReactNode;
  beforeNavLinks?: ReactNode;
  bottom?: ReactNode;
  currentPath: string;
  groups?: NavItemGroup[];
  homePath: string;
  logo?: ReactNode;
  navItems?: NavItem[];
  onGroupToggle?: (label: string, open: boolean) => void;
  onNavigate: (path: string) => void;
  onToggle: () => void;
  open: boolean;
};

const baseClass = 'frogbot-admin-sidebar';

const classes = (...values: (false | string | undefined)[]) => values.filter(Boolean).join(' ');

function NavGroup({
  children,
  initialOpen,
  label,
  onToggle,
}: {
  children: ReactNode;
  initialOpen: boolean;
  label: string;
  onToggle?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details
      className={`${baseClass}__group`}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        onToggle?.(event.currentTarget.open);
      }}
      open={open}
    >
      <summary className={`${baseClass}__group-label`}>{label}</summary>
      {children}
    </details>
  );
}

export function AppSidebar({
  afterNavLinks,
  beforeNavLinks,
  bottom,
  currentPath,
  groups = [],
  homePath,
  logo,
  navItems = [],
  onGroupToggle,
  onNavigate,
  onToggle,
  open,
}: AppSidebarProps) {
  const [labelsVisible, setLabelsVisible] = useState(open);
  const [stripHovered, setStripHovered] = useState(false);
  const [tooltip, setTooltip] = useState<{ label: string; left: number; top: number } | null>(null);

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

  const renderItem = (item: NavItem) => {
    const Icon = item.icon ?? FolderIcon;
    const active =
      currentPath === item.path || (item.path !== '/' && currentPath.startsWith(`${item.path}/`));
    return (
      <button
        aria-label={item.label}
        className={classes(`${baseClass}__item`, active && `${baseClass}__item--active`)}
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
    >
      <div className={`${baseClass}__header`}>
        <button
          aria-label={open ? 'Home' : 'Open sidebar'}
          className={classes(`${baseClass}__logo`, showToggleIcon && `${baseClass}__logo--toggle`)}
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
          <button
            aria-label="Close sidebar"
            className={`${baseClass}__collapse`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            type="button"
          >
            <SidebarLeftIcon size={20} />
          </button>
        )}
      </div>

      <nav className={`${baseClass}__nav`}>
        {beforeNavLinks}
        {navItems.map(renderItem)}
        {groups.map((group) =>
          open ? (
            <NavGroup
              initialOpen={group.open !== false}
              key={group.label}
              label={group.label}
              onToggle={(nextOpen) => onGroupToggle?.(group.label, nextOpen)}
            >
              <div className={`${baseClass}__items`}>{group.items.map(renderItem)}</div>
            </NavGroup>
          ) : (
            <div className={`${baseClass}__group`} key={group.label}>
              <div className={`${baseClass}__items`}>{group.items.map(renderItem)}</div>
            </div>
          ),
        )}
        {afterNavLinks}
      </nav>

      <div className={`${baseClass}__spacer`} />
      <div
        className={`${baseClass}__bottom`}
        onClick={open ? (event) => event.stopPropagation() : undefined}
      >
        {bottom}
      </div>

      {tooltip &&
        createPortal(
          <div className={`${baseClass}__tooltip`} style={{ left: tooltip.left, top: tooltip.top }}>
            <Tooltip staticPositioning>{tooltip.label}</Tooltip>
          </div>,
          document.body,
        )}
    </div>
  );
}
