import type { HTMLAttributes, ReactNode } from 'react';

export interface MessageProps extends HTMLAttributes<HTMLElement> {
  actions?: ReactNode;
  avatar?: ReactNode;
  role: 'system' | 'user' | 'assistant';
}

export function Message({ actions, avatar, children, className, role, ...props }: MessageProps) {
  return (
    <article
      className={`fb-message fb-message--${role}${className ? ` ${className}` : ''}`}
      data-role={role}
      {...props}
    >
      {avatar && <div className="fb-message__avatar">{avatar}</div>}
      <div
        className={`fb-message__body${role === 'user' ? ' fb-message__body--user' : ''}`}
      >
        <div className="fb-message__content">{children}</div>
        {actions && (
          <div className="fb-message__actions">{actions}</div>
        )}
      </div>
    </article>
  );
}
