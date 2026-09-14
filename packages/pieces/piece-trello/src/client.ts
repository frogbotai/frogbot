import { createHmac, timingSafeEqual } from 'node:crypto';

import { trelloAuth } from './config.js';

type Query = Record<string, boolean | number | string | undefined>;

export type TrelloWebhook = {
  callbackURL: string;
  id: string;
  idModel: string;
};

export type Trello = ReturnType<typeof createTrelloClient>;

export function createTrelloClient({ auth }: { auth: unknown }) {
  const credential = trelloAuth.parse(auth);

  async function request<T>(path: string, init: RequestInit & { query?: Query } = {}): Promise<T> {
    const url = new URL(`https://api.trello.com/1/${path.replace(/^\//, '')}`);

    url.searchParams.set('key', credential.username);
    url.searchParams.set('token', credential.password);

    Object.entries(init.query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });

    const response = await fetch(url, init);
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Trello request failed (${response.status}): ${text || response.statusText}`);
    }

    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    request,
    verifyWebhook(body: Buffer, signature: string | null, webhookUrl: string) {
      if (!signature || !/^[A-Za-z\d+/]{27}=$/.test(signature)) return false;

      const expected = createHmac('sha1', credential.applicationSecret)
        .update(body)
        .update(webhookUrl)
        .digest();
      const actual = Buffer.from(signature, 'base64');

      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
    async listAll<T extends { id: string }>(path: string) {
      const items: T[] = [];
      let before: string | undefined;

      while (true) {
        const page = await request<T[]>(path, { query: { limit: 1000, before } });

        items.push(...page);

        if (page.length < 1000) return items;

        before = page.at(-1)?.id;
      }
    },
    getCard: (cardId: string) => request<Record<string, unknown>>(`cards/${cardId}`),
    listBoards: () => request<Array<{ id: string; name: string }>>('members/me/boards'),
    listLists: (boardId: string) =>
      request<Array<{ id: string; name: string }>>(`boards/${boardId}/lists`),
    listLabels: (boardId: string) =>
      request<Array<{ color: string; id: string; name: string }>>(`boards/${boardId}/labels`),
    listWebhooks: () => request<TrelloWebhook[]>(`tokens/${credential.password}/webhooks`),
    createWebhook: (idModel: string, callbackURL: string) =>
      request<TrelloWebhook>('webhooks', {
        method: 'POST',
        query: { callbackURL, idModel },
      }),
    deleteWebhook: (id: string) => request(`webhooks/${id}`, { method: 'DELETE' }),
  };
}
