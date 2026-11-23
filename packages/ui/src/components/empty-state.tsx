import type { HTMLAttributes, ReactNode } from 'react';

import InboxIcon from '../icons/icons/InboxIcon.js';

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  /** The one button that fills the space, such as `Add a contact`. */
  action?: ReactNode;
  /** One sentence on what goes here or why it's empty. */
  description?: ReactNode;
  /** An icon for what goes here. Default an inbox. */
  icon?: ReactNode;
  /** `compact` for inside a card or table. Default `default`. */
  size?: 'compact' | 'default';
  /** A few words: `No contacts yet`, `Nothing matches these filters`. */
  title: ReactNode;
};

/** What an empty list, board or dashboard shows: what goes here and the one action that adds it. */
export function EmptyState({
  action,
  className,
  description,
  icon,
  size = 'default',
  title,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={`fb-empty-state fb-empty-state--${size}${className ? ` ${className}` : ''}`}
      {...props}
    >
      <div aria-hidden className="fb-empty-state__icon">
        {icon ?? <InboxIcon />}
      </div>
      <div className="fb-empty-state__text">
        <p className="fb-empty-state__title">{title}</p>
        {description && <p className="fb-empty-state__description">{description}</p>}
      </div>
      {action && <div className="fb-empty-state__action">{action}</div>}
    </div>
  );
}
