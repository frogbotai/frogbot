'use client';

import type { FrogBotSDK } from '@frogbotai/sdk';
import type { UIMessage } from 'ai';
import type { TurnState } from 'frogbot';
import { useEffect, useState } from 'react';

import { type MessageDocument, messageDocumentToUIMessage } from './messages.js';
import { chatRequest, type PayloadPage } from './rest.js';

export type UseChatOptions = {
  sdk: FrogBotSDK;
  messagesSlug: string;
  chatId?: string | number;
};

export type ChatMessages = {
  messages: UIMessage[];
  queued: UIMessage[];
};

export type LoadTurnStateOptions = {
  sdk: FrogBotSDK;
  agent: string;
  chatId: string | number;
};

export async function loadChatMessages({
  sdk,
  messagesSlug,
  chatId,
}: UseChatOptions): Promise<ChatMessages> {
  if (chatId === undefined) return { messages: [], queued: [] };

  const params = new URLSearchParams({
    depth: '0',
    limit: '0',
    sort: 'createdAt',
    'where[chat][equals]': String(chatId),
  });

  const page = await chatRequest<PayloadPage<MessageDocument>>(
    sdk,
    `/${encodeURIComponent(messagesSlug)}?${params}`,
  );

  return {
    messages: page.docs.filter(({ status }) => status !== 'queued').map(messageDocumentToUIMessage),
    queued: page.docs.filter(({ status }) => status === 'queued').map(messageDocumentToUIMessage),
  };
}

export async function loadChat(options: UseChatOptions): Promise<UIMessage[]> {
  const { messages } = await loadChatMessages(options);

  return messages;
}

export async function loadTurnState({
  sdk,
  agent,
  chatId,
}: LoadTurnStateOptions): Promise<TurnState> {
  const { state } = await chatRequest<{ state: TurnState }>(
    sdk,
    `/agents/${encodeURIComponent(agent)}/chats/${encodeURIComponent(String(chatId))}/pending`,
  );

  return state;
}

export function useChatMessages(options: UseChatOptions) {
  const [history, setHistory] = useState<ChatMessages>({ messages: [], queued: [] });
  const [loadedChatId, setLoadedChatId] = useState<string | number>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(options.chatId !== undefined);

  useEffect(() => {
    let active = true;
    setLoading(options.chatId !== undefined);
    void loadChatMessages(options)
      .then((next) => {
        if (active) {
          setHistory(next);
          setLoadedChatId(options.chatId);
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
  }, [options.sdk, options.messagesSlug, options.chatId]);

  return { ...history, loadedChatId, error, loading };
}
