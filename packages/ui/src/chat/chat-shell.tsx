import type { ReactNode } from 'react'

import { cn } from '../lib/utils'

export type ChatShellProps = {
  children: ReactNode
  sidebar?: ReactNode
  panel?: ReactNode
  className?: string
}

export function ChatShell({ children, className, panel, sidebar }: ChatShellProps) {
  return <div className={cn('flex h-full min-h-0 bg-background text-foreground', className)}>
    {sidebar && <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar p-3 md:block">{sidebar}</aside>}
    <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    {panel && <aside className="hidden w-96 shrink-0 overflow-y-auto border-l border-border lg:block">{panel}</aside>}
  </div>
}
