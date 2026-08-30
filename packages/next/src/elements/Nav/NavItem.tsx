'use client';

import { Link } from '@payloadcms/ui';
import { type ComponentType, createElement, isValidElement, type ReactNode } from 'react';

export type NavItemIcon = ComponentType<{ className?: string; size?: number }> | ReactNode;

export type NavItemProps = {
  active?: boolean;
  icon: NavItemIcon;
  label: string;
  path: string;
};

const baseClass = 'frogbot-nav-item';

export function NavItem({ active = false, icon, label, path }: NavItemProps) {
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={[baseClass, 'fb-slide-right-1', active && `${baseClass}--active`]
        .filter(Boolean)
        .join(' ')}
      href={path}
    >
      <span aria-hidden="true" className={`${baseClass}__icon`}>
        {isValidElement(icon)
          ? icon
          : createElement(icon as ComponentType<{ className?: string; size?: number }>, {
              className: `${baseClass}__icon-svg`,
              size: 20,
            })}
      </span>
      <span className={`${baseClass}__label`}>{label}</span>
    </Link>
  );
}
