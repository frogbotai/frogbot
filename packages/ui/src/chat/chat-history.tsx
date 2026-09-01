'use client';

import type { FrogBotSDK } from '@frogbotai/sdk';
import type { UIMessage } from 'ai';
import type { ReactNode } from 'react';

import { ChatHistoryActions } from './chat-history-actions.js';
import type { ChatDocument } from './use-chats.js';

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
  sdk?: FrogBotSDK;
  chatsSlug?: string;
  messagesSlug?: string;
  onNewChat?: () => void;
};

export function ChatHistory({
  activeChatId,
  className,
  fallbackTitle,
  onChatChange,
  renderActions,
  chats,
  chatsSlug,
  messagesSlug,
  onNewChat,
  sdk,
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
        return sdk && chatsSlug && messagesSlug ? (
          <ChatHistoryActions
            chat={chat}
            chatsSlug={chatsSlug}
            key={chat.id}
            messagesSlug={messagesSlug}
            onDeleted={(deleted) => {
              if (String(activeChatId) === String(deleted.id)) onNewChat?.();
            }}
            sdk={sdk}
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
