'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatDocument, ChatPage, ChatPlatformAdapter } from './adapter.js';

export type UseChatsOptions = {
  adapter: ChatPlatformAdapter;
  agent?: string;
  page?: number;
  limit?: number;
  initialData?: ChatPage;
  revalidate?: boolean;
  refreshInterval?: number;
};

export type UseChatDocumentOptions = {
  adapter: ChatPlatformAdapter;
  chatId?: string | number;
  initialData?: ChatDocument;
  revalidate?: boolean;
};

export const CHAT_MUTATION_EVENT = 'frogbot:chats:mutated';

export function emitChatMutation() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHAT_MUTATION_EVENT));
}

function isChatDocument(chat: ChatDocument | undefined, chatId: string | number | undefined) {
  return chat !== undefined && chatId !== undefined && String(chat.id) === String(chatId);
}

export function useChatDocument({
  adapter,
  chatId,
  initialData,
  revalidate,
}: UseChatDocumentOptions) {
  const [chat, setChat] = useState(initialData);
  const [error, setError] = useState<Error>();
  const request = useRef(0);
  const initial = useRef(initialData);

  initial.current = initialData;

  const refresh = useCallback(() => {
    const current = ++request.current;

    setError(undefined);

    if (chatId === undefined) return;

    void adapter
      .getChat(chatId)
      .then((next) => {
        if (request.current === current) setChat(next);
      })
      .catch((value: unknown) => {
        if (request.current === current) {
          setError(value instanceof Error ? value : new Error(String(value)));
        }
      });
  }, [adapter, chatId]);

  useEffect(() => {
    if (isChatDocument(initial.current, chatId)) {
      setError(undefined);
      setChat(initial.current);
    } else {
      refresh();
    }

    return () => {
      request.current++;
    };
  }, [chatId, refresh]);

  useEffect(() => {
    if (!revalidate) return;

    window.addEventListener('focus', refresh);
    window.addEventListener(CHAT_MUTATION_EVENT, refresh);

    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener(CHAT_MUTATION_EVENT, refresh);
    };
  }, [refresh, revalidate]);

  return {
    chat: isChatDocument(chat, chatId) ? chat : undefined,
    error,
    refresh,
  };
}

export function useChats(options: UseChatsOptions) {
  const [result, setResult] = useState<ChatPage | undefined>(options.initialData);
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(!options.initialData);
  const request = useRef(0);
  const hasResult = useRef(Boolean(options.initialData));

  const refresh = useCallback(() => {
    const current = ++request.current;
    if (!hasResult.current) setLoading(true);

    void options.adapter
      .listChats({ agent: options.agent, page: options.page ?? 1, limit: options.limit ?? 20 })
      .then((next) => {
        if (request.current === current) {
          hasResult.current = true;
          setResult(next);
          setError(undefined);
          setLoading(false);
        }
      })
      .catch((value: unknown) => {
        if (request.current === current) {
          setError(value instanceof Error ? value : new Error(String(value)));
          setLoading(false);
        }
      });
  }, [options.adapter, options.agent, options.limit, options.page]);

  useEffect(() => {
    if (!options.initialData) refresh();

    return () => {
      request.current++;
    };
  }, [options.initialData, refresh]);

  useEffect(() => {
    if (!options.revalidate) return;
    const interval = window.setInterval(refresh, options.refreshInterval ?? 30_000);
    window.addEventListener('focus', refresh);
    window.addEventListener(CHAT_MUTATION_EVENT, refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(CHAT_MUTATION_EVENT, refresh);
    };
  }, [options.refreshInterval, options.revalidate, refresh]);

  return {
    ...result,
    error,
    loading,
    refresh,
  };
}
