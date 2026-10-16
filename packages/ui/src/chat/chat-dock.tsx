import type { HTMLAttributes, ReactNode } from 'react';

export type ChatDockProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  header?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
};

export function ChatDock({ children, className, footer, header, ...props }: ChatDockProps) {
  return (
    <div className={`fb-chat-dock${className ? ` ${className}` : ''}`} {...props}>
      {header !== undefined && <div className="fb-chat-dock__header">{header}</div>}
      <div className="fb-chat-dock__content">{children}</div>
      {footer !== undefined && <div className="fb-chat-dock__footer">{footer}</div>}
    </div>
  );
}
