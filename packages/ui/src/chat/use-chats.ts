'use client';

import type { FrogBotSDK } from '@frogbotai/sdk';
import { useCallback, useEffect, useRef, useState } from 'react';

import { chatRequest, type PayloadPage } from './rest.js';

export type ChatDocument = {
  id: string | number;
  title?: string | null;
  agent: string;
  lastMessageAt?: string | null;
};

export type UseChatsOptions = {
  sdk: FrogBotSDK;
  chatsSlug: string;
  agent?: string;
  page?: number;
  limit?: number;
  initialData?: PayloadPage<ChatDocument>;
  revalidate?: boolean;
  refreshInterval?: number;
};

export const CHAT_MUTATION_EVENT = 'frogbot:chats:mutated';

export function emitChatMutation() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHAT_MUTATION_EVENT));
}

export async function loadChats({
  sdk,
  agent,
  chatsSlug,
  page = 1,
  limit = 20,
}: UseChatsOptions): Promise<PayloadPage<ChatDocument>> {
  const params = new URLSearchParams({
    depth: '0',
    sort: '-lastMessageAt',
    page: String(page),
    limit: String(limit),
  });
  if (agent) params.set('where[agent][equals]', agent);
  return chatRequest(sdk, `/${encodeURIComponent(chatsSlug)}?${params}`);
}

export function useChats(options: UseChatsOptions) {
  const [result, setResult] = useState<PayloadPage<ChatDocument> | undefined>(options.initialData);
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(!options.initialData);
  const request = useRef(0);
  const hasResult = useRef(Boolean(options.initialData));

  const refresh = useCallback(() => {
    const current = ++request.current;
    if (!hasResult.current) setLoading(true);
    void loadChats(options)
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
  }, [options.sdk, options.agent, options.chatsSlug, options.limit, options.page]);

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
