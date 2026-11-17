'use client';

import './Notifications.css';

import { PayloadLink } from '@frogbotai/ui/admin';
import type { ReactNode } from 'react';

import { adminPath, badge, INBOX_PATH } from '../shared.js';

/** Props for `BellLink`. */
export type BellLinkProps = {
  adminRoute: string;
  children: ReactNode;
  unread: number;
};

/** The bell's link to the inbox, with the unread count as a badge. */
export function BellLink({ adminRoute, children, unread }: BellLinkProps) {
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <PayloadLink aria-label={label} className="fb-bell" href={adminPath(adminRoute, INBOX_PATH)}>
      {children}
      {unread ? <span className="fb-bell__badge">{badge(unread)}</span> : null}
    </PayloadLink>
  );
}
