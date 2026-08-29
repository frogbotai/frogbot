import type { ReactNode } from 'react';

export type ChatShellProps = {
  children: ReactNode;
  sidebar?: ReactNode;
  panel?: ReactNode;
  className?: string;
};

export function ChatShell({ children, className, panel, sidebar }: ChatShellProps) {
  return (
    <div className={`fb-chat-shell${className ? ` ${className}` : ''}`}>
      {sidebar && <aside className="fb-chat-shell__sidebar">{sidebar}</aside>}
      <main className="fb-chat-shell__main">{children}</main>
      {panel && <aside className="fb-chat-shell__panel">{panel}</aside>}
    </div>
  );
}
