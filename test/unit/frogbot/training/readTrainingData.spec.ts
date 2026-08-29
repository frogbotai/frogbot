import { describe, expect, it, vi } from 'vitest';

import type { Frogbot } from '../../../../packages/frogbot/src/frogbot.js';
import { readTrainingData } from '../../../../packages/frogbot/src/training/readTrainingData.js';

type Page = { docs: Record<string, unknown>[]; hasNextPage: boolean };

function stubFrogbot(pages: { chats: Page[]; messages: Record<string, Page[]> }) {
  const find = vi.fn(async (args: Record<string, unknown>) => {
    const page = (args.page as number) - 1;
    if (args.collection === 'chats') return pages.chats[page];
    const chatID = String((args.where as { chat: { equals: unknown } }).chat.equals);
    return pages.messages[chatID][page];
  });

  return {
    find,
    frogbot: {
      config: { chat: { enabled: true, chatsSlug: 'chats', messagesSlug: 'messages' } },
      find,
    } as unknown as Frogbot,
  };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe('readTrainingData', () => {
  it('pages chats and messages and preserves persisted parts', async () => {
    const { frogbot, find } = stubFrogbot({
      chats: [
        { docs: [{ id: 1 }], hasNextPage: true },
        { docs: [{ id: 2 }], hasNextPage: false },
      ],
      messages: {
        1: [
          { docs: [{ id: 'a', parts: [{ type: 'text', text: 'hi' }] }], hasNextPage: true },
          {
            docs: [{ id: 'b', parts: [{ type: 'future-part', payload: { deep: true } }] }],
            hasNextPage: false,
          },
        ],
        2: [{ docs: [], hasNextPage: false }],
      },
    });

    const records = await collect(readTrainingData(frogbot, { pageSize: 1 }));

    expect(records).toEqual([
      {
        chat: { id: 1 },
        messages: [
          { id: 'a', parts: [{ type: 'text', text: 'hi' }] },
          { id: 'b', parts: [{ type: 'future-part', payload: { deep: true } }] },
        ],
      },
      { chat: { id: 2 }, messages: [] },
    ]);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'chats',
        depth: 0,
        limit: 1,
        sort: ['createdAt', 'id'],
      }),
    );
  });

  it('forwards filters and access options', async () => {
    const { frogbot, find } = stubFrogbot({
      chats: [{ docs: [], hasNextPage: false }],
      messages: {},
    });
    const where = { agent: { equals: 'support' } };

    await collect(readTrainingData(frogbot, { where, overrideAccess: true }));

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where, overrideAccess: true }));
  });

  it('rejects disabled chat persistence', async () => {
    const frogbot = { config: { chat: { enabled: false } } } as unknown as Frogbot;

    await expect(collect(readTrainingData(frogbot))).rejects.toThrow(
      'Training data export requires chat persistence.',
    );
  });

  it('rejects invalid page sizes', async () => {
    const { frogbot } = stubFrogbot({ chats: [], messages: {} });

    await expect(collect(readTrainingData(frogbot, { pageSize: 0 }))).rejects.toThrow(
      'pageSize must be a positive integer',
    );
  });
});
