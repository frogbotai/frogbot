import type { HTMLAttributes, ReactNode } from 'react';

import { AgentAvatar } from './agent-avatar.js';
import { UserAvatar } from './user-avatar.js';
import { formatValue } from './value.js';

export type ActivityItem = {
  /** What happened, after the actor's name: `moved this to Won`. */
  action: ReactNode;
  /** Who did it. `agent: true` marks an AI agent. */
  actor: { agent?: boolean; email?: string; name: string };
  /** A quote, comment or diff shown under the line. */
  detail?: ReactNode;
  /** Stable key. */
  id: string;
  /** When it happened. */
  time: Date | number | string;
};

export type ActivityFeedProps = Omit<HTMLAttributes<HTMLOListElement>, 'children'> & {
  /** Newest first or oldest first, as given. */
  items: ActivityItem[];
  /** Reference time for "2 hours ago". Default now. */
  now?: Date | number;
};

/** A record's history: who did what and when, people and agents alike. */
export function ActivityFeed({ className, items, now, ...props }: ActivityFeedProps) {
  return (
    <ol className={`fb-activity${className ? ` ${className}` : ''}`} {...props}>
      {items.map((item) => (
        <li className="fb-activity__item" key={item.id}>
          {item.actor.agent ? (
            <AgentAvatar className="fb-activity__avatar" name={item.actor.name} />
          ) : (
            <UserAvatar
              className="fb-activity__avatar"
              email={item.actor.email}
              name={item.actor.name}
              size={24}
            />
          )}
          <div className="fb-activity__body">
            <p className="fb-activity__line">
              <span className="fb-activity__actor">{item.actor.name}</span> {item.action}
              <time className="fb-activity__time" dateTime={new Date(item.time).toISOString()}>
                {formatValue(item.time, { format: 'relative', now })}
              </time>
            </p>
            {item.detail && <div className="fb-activity__detail">{item.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
