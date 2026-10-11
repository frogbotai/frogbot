'use client';

import type { UIMessage } from 'ai';
import type { ReactNode } from 'react';

import type { ChatDocument, ChatPlatformAdapter } from './adapter.js';
import { ChatHistoryActions } from './chat-history-actions.js';

export function deriveChatTitle(
  messages: UIMessage[],
  fallback: string,
  maxLength?: number,
): string {
  const text = messages
    .find((message) => message.role === 'user')
    ?.parts.find((part) => part.type === 'text')
    ?.text.trim();

  if (!text) return fallback;

  return maxLength && text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export type ChatHistoryProps = {
  chats: ChatDocument[];
  activeChatId?: string | number;
  onChatChange: (chatId: string | number) => void;
  fallbackTitle: ReactNode;
  renderActions?: (chat: ChatDocument) => ReactNode;
  className?: string;
  adapter?: ChatPlatformAdapter;
  onNewChat?: () => void;
};

export function ChatHistory({
  activeChatId,
  adapter,
  className,
  fallbackTitle,
  onChatChange,
  renderActions,
  chats,
  onNewChat,
}: ChatHistoryProps) {
  return (
    <nav className={`fb-chat-history${className ? ` ${className}` : ''}`}>
      {chats.map((chat) => {
        const row = (
          <div
            key={chat.id}
            className={`fb-chat-history__item${
              String(activeChatId) === String(chat.id) ? ' fb-chat-history__item--active' : ''
            }`}
          >
            <button
              type="button"
              aria-current={String(activeChatId) === String(chat.id) ? 'page' : undefined}
              onClick={() => onChatChange(chat.id)}
              className="fb-chat-history__button"
            >
              {chat.title || fallbackTitle}
            </button>
            {renderActions?.(chat)}
          </div>
        );

        return adapter ? (
          <ChatHistoryActions
            adapter={adapter}
            chat={chat}
            key={chat.id}
            onDeleted={(deleted) => {
              if (String(activeChatId) === String(deleted.id)) onNewChat?.();
            }}
          >
            {row}
          </ChatHistoryActions>
        ) : (
          row
        );
      })}
    </nav>
  );
}
