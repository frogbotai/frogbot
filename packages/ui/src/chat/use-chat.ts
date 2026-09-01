'use client';

import type { FrogBotSDK } from '@frogbotai/sdk';
import type { UIMessage } from 'ai';
import { useEffect, useState } from 'react';

import { type MessageDocument, messageDocumentToUIMessage } from './messages.js';
import { chatRequest, type PayloadPage } from './rest.js';

export type UseChatOptions = {
  sdk: FrogBotSDK;
  messagesSlug: string;
  chatId?: string | number;
};

export async function loadChat({
  sdk,
  messagesSlug,
  chatId,
}: UseChatOptions): Promise<UIMessage[]> {
  if (chatId === undefined) return [];
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
  return page.docs.map(messageDocumentToUIMessage);
}

export function useChatMessages(options: UseChatOptions) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [loadedChatId, setLoadedChatId] = useState<string | number>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(options.chatId !== undefined);

  useEffect(() => {
    let active = true;
    setLoading(options.chatId !== undefined);
    void loadChat(options)
      .then((next) => {
        if (active) {
          setMessages(next);
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

  return { messages, loadedChatId, error, loading };
}
