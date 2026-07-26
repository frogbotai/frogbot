import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../lib/utils'

export interface MessageProps extends HTMLAttributes<HTMLElement> {
  actions?: ReactNode
  avatar?: ReactNode
  role: 'system' | 'user' | 'assistant'
}

export function Message({ actions, avatar, children, className, role, ...props }: MessageProps) {
  return (
    <article className={cn('group flex w-full gap-3 py-3', role === 'user' && 'flex-row-reverse', className)} data-role={role} {...props}>
      {avatar && <div className="shrink-0">{avatar}</div>}
      <div className={cn('min-w-0 max-w-[85%]', role === 'user' && 'rounded-xl bg-secondary px-4 py-2')}>
        <div className="space-y-3">{children}</div>
        {actions && <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">{actions}</div>}
      </div>
    </article>
  )
}
