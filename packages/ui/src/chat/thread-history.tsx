'use client'

import type { UIMessage } from 'ai'
import type { ReactNode } from 'react'

import { cn } from '../lib/utils'
import type { ThreadDocument } from './use-threads'

export function deriveThreadTitle(messages: UIMessage[], fallback: string, maxLength = 48): string {
  const text = messages.find((message) => message.role === 'user')?.parts.find((part) => part.type === 'text')?.text.trim()
  if (!text) return fallback
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text
}

export type ThreadHistoryProps = {
  threads: ThreadDocument[]
  activeThreadId?: string | number
  onThreadChange: (threadId: string | number) => void
  fallbackTitle: ReactNode
  renderActions?: (thread: ThreadDocument) => ReactNode
  className?: string
}

export function ThreadHistory({ activeThreadId, className, fallbackTitle, onThreadChange, renderActions, threads }: ThreadHistoryProps) {
  return <nav className={cn('flex flex-col gap-1', className)}>
    {threads.map((thread) => <div key={thread.id} className={cn('group flex items-center rounded-lg', String(activeThreadId) === String(thread.id) && 'bg-sidebar-accent text-sidebar-accent-foreground')}>
      <button type="button" aria-current={String(activeThreadId) === String(thread.id) ? 'page' : undefined} onClick={() => onThreadChange(thread.id)} className="min-w-0 flex-1 truncate px-3 py-2 text-left">
        {thread.title || fallbackTitle}
      </button>
      {renderActions?.(thread)}
    </div>)}
  </nav>
}
