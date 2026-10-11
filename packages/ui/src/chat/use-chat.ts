'use client';

import { useEffect, useState } from 'react';

import type { ChatMessages, ChatPlatformAdapter } from './adapter.js';

export type UseChatOptions = {
  adapter: ChatPlatformAdapter;
  chatId?: string | number;
};

export function useChatMessages({ adapter, chatId }: UseChatOptions) {
  const [history, setHistory] = useState<ChatMessages>({ messages: [], queued: [] });
  const [loadedChatId, setLoadedChatId] = useState<string | number>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(chatId !== undefined);

  useEffect(() => {
    let active = true;
    setLoading(chatId !== undefined);

    const load =
      chatId === undefined
        ? Promise.resolve<ChatMessages>({ messages: [], queued: [] })
        : adapter.loadMessages(chatId);

    void load
      .then((next) => {
        if (active) {
          setHistory(next);
          setLoadedChatId(chatId);
          setError(undefined);
          setLoading(false);
        }
      })
      .catch((value: unknown) => {
        if (active) {
          setError(value instanceof Error ? value : new Error(String(value)));
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [adapter, chatId]);

  return { ...history, loadedChatId, error, loading };
}
