'use client';

import type { UIMessage } from 'ai';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils';
import type { ChatDocument } from './use-chats';

export function deriveChatTitle(messages: UIMessage[], fallback: string, maxLength = 48): string {
  const text = messages
    .find((message) => message.role === 'user')
    ?.parts.find((part) => part.type === 'text')
    ?.text.trim();
  if (!text) return fallback;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export type ChatHistoryProps = {
  chats: ChatDocument[];
  activeChatId?: string | number;
  onChatChange: (chatId: string | number) => void;
  fallbackTitle: ReactNode;
  renderActions?: (chat: ChatDocument) => ReactNode;
  className?: string;
};

export function ChatHistory({
  activeChatId,
  className,
  fallbackTitle,
  onChatChange,
  renderActions,
  chats,
}: ChatHistoryProps) {
  return (
    <nav className={cn('flex flex-col gap-1', className)}>
      {chats.map((chat) => (
        <div
          key={chat.id}
          className={cn(
            'group flex items-center rounded-lg',
            String(activeChatId) === String(chat.id) &&
              'bg-sidebar-accent text-sidebar-accent-foreground',
          )}
        >
          <button
            type="button"
            aria-current={String(activeChatId) === String(chat.id) ? 'page' : undefined}
            onClick={() => onChatChange(chat.id)}
            className="min-w-0 flex-1 truncate px-3 py-2 text-left"
          >
            {chat.title || fallbackTitle}
          </button>
          {renderActions?.(chat)}
        </div>
      ))}
    </nav>
  );
}
