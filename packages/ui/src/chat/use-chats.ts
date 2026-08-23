'use client';

import type { FrogBotSDK } from '@frogbotai/sdk';
import { useCallback, useEffect, useState } from 'react';

import { chatRequest, type PayloadPage } from './rest';

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
};

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
  const [result, setResult] = useState<PayloadPage<ChatDocument>>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    let active = true;
    setLoading(true);
    void loadChats(options)
      .then((next) => {
        if (active) {
          setResult(next);
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
  }, [options.sdk, options.agent, options.chatsSlug, options.limit, options.page]);

  useEffect(() => refresh(), [refresh]);

  return {
    ...result,
    error,
    loading,
    refresh: () => {
      refresh();
    },
  };
}
