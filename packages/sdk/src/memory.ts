import type { Memory, MemoryList, MemorySearchHit } from 'frogbot/memory';

import type { FrogBotSDKSend } from './types.js';

export type MemoryScopeOptions = {
  /**
   * The scope word: `me`, `agent`, `team` or a custom word the app declares.
   */
  scope: string;
  /**
   * The agent slug the `agent` scope and the app's scope functions see.
   */
  agent?: string;
};

export type MemorySaveOptions = MemoryScopeOptions & {
  /**
   * What to remember, up to 4,000 characters.
   */
  text: string;
  /**
   * Saving with a key the scope already holds replaces that memory.
   */
  key?: string;
  /**
   * Pinned memories are in every agent turn.
   */
  pinned?: boolean;
};

export type MemorySearchOptions = MemoryScopeOptions & {
  query: string;
  /**
   * The most hits to return, from 1 to 100. Defaults to 10.
   */
  limit?: number;
};

export type MemoryListOptions = MemoryScopeOptions & {
  /**
   * Only pinned, or only unpinned, memories.
   */
  pinned?: boolean;
  /**
   * Memories per page, from 1 to 1,000. Defaults to 100.
   */
  limit?: number;
  page?: number;
};

export type MemoryUpdateOptions = MemoryScopeOptions & {
  id: number | string;
  text?: string;
  /**
   * `null` removes the key.
   */
  key?: string | null;
  pinned?: boolean;
};

export type MemoryForgetOptions = MemoryScopeOptions & {
  /**
   * The memory to forget. Without it, the whole scope is forgotten.
   */
  id?: number | string;
};

const path = '/frogbot/memory';

function withQuery(base: string, query: Record<string, unknown>): string {
  const params = new URLSearchParams();

  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) params.set(name, String(value));
  }

  return `${base}?${params}`;
}

function itemPath(id: number | string): string {
  return `${path}/${encodeURIComponent(String(id))}`;
}

/** `sdk.memory`: the REST counterpart of `frogbot.memory`, run as the signed-in person. */
export function memoryClient(send: FrogBotSDKSend) {
  const call = async <T>(args: Parameters<FrogBotSDKSend>[0]): Promise<T> =>
    (await send(args)).json() as Promise<T>;

  return {
    save: ({ agent, key, pinned, scope, text }: MemorySaveOptions, init?: RequestInit) =>
      call<Memory>({ init, method: 'POST', path, json: { scope, agent, text, key, pinned } }),
    search: ({ agent, limit, query, scope }: MemorySearchOptions, init?: RequestInit) =>
      call<MemorySearchHit[]>({
        init,
        method: 'GET',
        path: withQuery(`${path}/search`, { scope, agent, query, limit }),
      }),
    list: ({ agent, limit, page, pinned, scope }: MemoryListOptions, init?: RequestInit) =>
      call<MemoryList>({
        init,
        method: 'GET',
        path: withQuery(path, { scope, agent, pinned, limit, page }),
      }),
    get: ({ agent, id, scope }: MemoryScopeOptions & { id: number | string }, init?: RequestInit) =>
      call<Memory>({ init, method: 'GET', path: withQuery(itemPath(id), { scope, agent }) }),
    update: ({ agent, id, key, pinned, scope, text }: MemoryUpdateOptions, init?: RequestInit) =>
      call<Memory>({
        init,
        method: 'PATCH',
        path: itemPath(id),
        json: { scope, agent, text, key, pinned },
      }),
    forget: ({ agent, id, scope }: MemoryForgetOptions, init?: RequestInit) =>
      call<{ deleted: number }>({
        init,
        method: 'DELETE',
        path: withQuery(id === undefined ? path : itemPath(id), { scope, agent }),
      }),
  };
}

export type FrogBotSDKMemory = ReturnType<typeof memoryClient>;
