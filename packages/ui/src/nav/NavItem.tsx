'use client';

import { type ComponentType, createElement, type ReactNode } from 'react';

import { isRenderableNode } from '../lib/isRenderableNode.js';
import { useNavAdapter } from './adapter.js';

export type NavItemIcon = ComponentType<{ className?: string; size?: number }> | ReactNode;

export type NavItemProps = {
  active?: boolean;
  className?: string;
  icon?: NavItemIcon;
  label: string;
  path: string;
};

const baseClass = 'fb-nav-item';

export function NavItem({ active = false, className, icon, label, path }: NavItemProps) {
  const { Link } = useNavAdapter();

  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={[
        baseClass,
        className,
        active && `${baseClass}--active`,
        icon && `${baseClass}--with-icon`,
      ]
        .filter(Boolean)
        .join(' ')}
      href={path}
    >
      {icon ? (
        <span aria-hidden="true" className={`${baseClass}__icon`}>
          {isRenderableNode(icon)
            ? icon
            : createElement(icon as ComponentType<{ className?: string; size?: number }>, {
                className: `${baseClass}__icon-svg`,
                size: 20,
              })}
        </span>
      ) : null}
      <span className={`${baseClass}__label`}>{label}</span>
    </Link>
  );
}
