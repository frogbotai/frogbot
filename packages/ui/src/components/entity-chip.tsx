import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { AgentAvatar } from './agent-avatar.js';
import { UserAvatar } from './user-avatar.js';

type ChipBase = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
  href?: string;
};

export type PersonChipProps = ChipBase & {
  /** For Gravatar and initials when there's no name. */
  email?: string;
  /** Shows the agent mark instead of initials. */
  agent?: boolean;
  /** The person's display name. */
  name: string;
  /** A picture URL; initials show when it's missing or fails. */
  src?: string;
};

export type RecordChipProps = ChipBase & {
  /** A small icon for the kind of record. */
  icon?: ReactNode;
  /** The record's title. */
  label: ReactNode;
};

function Chip({ children, className, href, ...props }: ChipBase & { children: ReactNode }) {
  const name = `fb-chip${href ? ' fb-chip--link' : ''}${className ? ` ${className}` : ''}`;

  if (href) {
    return (
      <a className={name} href={href} {...props}>
        {children}
      </a>
    );
  }

  return (
    <span className={name} {...props}>
      {children}
    </span>
  );
}

/** A person or agent as avatar and name, for owners, assignees and authors. */
export function PersonChip({ agent, email, name, src, ...props }: PersonChipProps) {
  return (
    <Chip {...props}>
      {agent ? (
        <AgentAvatar className="fb-chip__avatar" name={name} size={20} />
      ) : (
        <UserAvatar className="fb-chip__avatar" email={email} name={name} size={20} src={src} />
      )}
      <span className="fb-chip__label">{name}</span>
    </Chip>
  );
}

/** A link to another record, for relationship values. */
export function RecordChip({ icon, label, ...props }: RecordChipProps) {
  return (
    <Chip {...props}>
      {icon && <span className="fb-chip__icon">{icon}</span>}
      <span className="fb-chip__label">{label}</span>
    </Chip>
  );
}
