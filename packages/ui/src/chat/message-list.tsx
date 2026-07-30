'use client'

import type { UIMessage } from 'ai'
import { type HTMLAttributes, type ReactNode,useEffect, useRef, useState } from 'react'

import { cn } from '../lib/utils'
import { Message } from './message'
import { MessagePart } from './message-part'

export interface MessageListProps extends HTMLAttributes<HTMLDivElement> {
  messages: UIMessage[]
  renderMessage?: (message: UIMessage) => ReactNode
}

export function MessageList({ className, messages, renderMessage, ...props }: MessageListProps) {
  const ref = useRef<HTMLDivElement>(null)
  const anchored = useRef(true)
  const [showJump, setShowJump] = useState(false)
  const scrollToBottom = () => ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' })

  useEffect(() => {
    if (!anchored.current) return
    const frame = requestAnimationFrame(scrollToBottom)
    return () => cancelAnimationFrame(frame)
  }, [messages])

  return <div className="relative min-h-0 flex-1">
    <div ref={ref} className={cn('h-full overflow-y-auto px-4', className)} onScroll={(event) => {
      const node = event.currentTarget
      anchored.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48
      setShowJump(!anchored.current)
    }} {...props}>
      {messages.map((message) => renderMessage ? renderMessage(message) : <Message key={message.id} role={message.role}>{message.parts.map((part, index) => <MessagePart key={`${message.id}-${index}`} part={part} />)}</Message>)}
    </div>
    {showJump && <button type="button" onClick={() => { anchored.current = true; setShowJump(false); scrollToBottom() }} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background px-3 py-1 text-sm shadow">Jump to latest</button>}
  </div>
}
