import { describe, expect, it } from 'vitest';

import { createQuestionStore } from '../../../../packages/frogbot/src/channels/questions/createQuestionStore.js';
import type { StoredQuestion } from '../../../../packages/frogbot/src/channels/questions/types.js';
import type { KV } from '../../../../packages/frogbot/src/kv/types.js';
import { createMemoryKV } from './helpers.js';

const prefix = 'channels:support:slack:questions';

function storeFixture() {
  const memory = createMemoryKV();

  const store = createQuestionStore({
    adapter: { channelIdFromThreadId: (id: string) => id.split(':')[0] },
    kv: memory.kv as unknown as KV,
    namespace: 'support:slack',
  });

  return { ...memory, store };
}

function storedQuestion({
  messages = [{ id: 'card-1', postedAt: '2026-09-26T00:00:00.000Z' }],
  toolCallId = 'call-1',
  ...extra
}: Partial<StoredQuestion> & { toolCallId?: string } = {}): StoredQuestion {
  return {
    call: {
      toolCallId,
      toolName: 'question',
      input: { questions: [{ header: 'Color', question: 'Pick one', options: [], custom: true }] },
      messageId: 'assistant-1',
      chatId: 'chat-1',
      agentSlug: 'support',
      createdAt: '2026-09-26T00:00:00.000Z',
    },
    chatId: 'chat-1',
    messages,
    revision: 0,
    thread: { id: 'channel:thread-1' } as StoredQuestion['thread'],
    ...extra,
  };
}

const page = { id: 'page-1', postedAt: '2026-09-26T00:00:00.000Z' };
const card = { id: 'card-1', postedAt: '2026-09-26T00:00:01.000Z' };

describe('channel question store', () => {
  it('finds a question by every one of its messages', async () => {
    const { store } = storeFixture();

    await store.save({ questions: [storedQuestion({ messages: [page, card] })] });

    const byPage = await store.findByMessage({ threadId: 'channel:thread-1', messageId: 'page-1' });
    const byCard = await store.findByMessage({ threadId: 'channel:thread-1', messageId: 'card-1' });

    expect(byPage.map(({ messages }) => messages)).toEqual([[page, card]]);
    expect(byCard.map(({ messages }) => messages)).toEqual([[page, card]]);
  });

  it('stores questions under the channel namespace', async () => {
    const { store, values } = storeFixture();

    await store.save({ questions: [storedQuestion()] });

    expect([...values.keys()].sort()).toEqual([
      `${prefix}:call:chat-1:call-1`,
      `${prefix}:chat:chat-1`,
      `${prefix}:message:channel:card-1`,
    ]);
  });

  it('indexes calls that share one message together', async () => {
    const { store } = storeFixture();

    await store.save({
      questions: [storedQuestion(), storedQuestion({ toolCallId: 'call-2' })],
    });

    const found = await store.findByMessage({ threadId: 'channel:thread-1', messageId: 'card-1' });

    expect(found.map(({ call }) => call.toolCallId)).toEqual(['call-1', 'call-2']);
  });

  it('keeps open questions from earlier renders in the chat index and drops settled ones', async () => {
    const { store } = storeFixture();

    await store.save({ questions: [storedQuestion()] });
    await store.save({ questions: [storedQuestion({ toolCallId: 'call-2' })] });

    expect(
      (await store.findByChat({ chatId: 'chat-1' })).map(({ call }) => call.toolCallId),
    ).toEqual(['call-1', 'call-2']);

    await store.settle({
      question: (await store.find({ chatId: 'chat-1', toolCallId: 'call-1' }))!,
    });
    await store.save({ questions: [storedQuestion({ toolCallId: 'call-3' })] });

    expect(
      (await store.findByChat({ chatId: 'chat-1' })).map(({ call }) => call.toolCallId),
    ).toEqual(['call-2', 'call-3']);
  });

  it('fills a missing posted time with the current time', async () => {
    const { store } = storeFixture();
    const before = Date.now();

    await store.save({
      questions: [storedQuestion({ messages: [{ id: 'card-1', postedAt: '' }] })],
    });

    const saved = await store.find({ chatId: 'chat-1', toolCallId: 'call-1' });

    expect(new Date(saved!.messages[0].postedAt).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('refuses a question without messages', async () => {
    const { store, values } = storeFixture();

    await expect(store.save({ questions: [storedQuestion({ messages: [] })] })).rejects.toThrow(
      'at least one message',
    );
    expect(values.size).toBe(0);
  });

  it('changes a question only at the expected revision', async () => {
    const { store } = storeFixture();

    await store.save({ questions: [storedQuestion()] });

    const next = storedQuestion({ revision: 1, state: { step: 2 } });

    expect(await store.change({ expected: 1, question: next })).toBe(false);
    expect(await store.change({ expected: 0, question: next })).toBe(true);
    expect(await store.change({ expected: 0, question: next })).toBe(false);
    expect(await store.find({ chatId: 'chat-1', toolCallId: 'call-1' })).toMatchObject({
      revision: 1,
      state: { step: 2 },
    });
  });

  it('indexes new messages on change and still finds the question by its earlier ones', async () => {
    const { store } = storeFixture();
    const next = { id: 'card-2', postedAt: '2026-09-26T00:00:05.000Z' };

    await store.save({ questions: [storedQuestion()] });
    await store.change({
      expected: 0,
      question: storedQuestion({ messages: [card, next], revision: 1 }),
    });

    const byNext = await store.findByMessage({ threadId: 'channel:thread-1', messageId: 'card-2' });
    const byFirst = await store.findByMessage({
      threadId: 'channel:thread-1',
      messageId: 'card-1',
    });

    expect(byNext.map(({ messages }) => messages.at(-1)!.id)).toEqual(['card-2']);
    expect(byFirst.map(({ messages }) => messages.at(-1)!.id)).toEqual(['card-2']);
  });

  it('settles a question once, clears its pending update, and keeps it for a day', async () => {
    const { store, ttls } = storeFixture();

    await store.save({ questions: [storedQuestion({ pending: 'update' })] });
    await store.settle({
      question: (await store.find({ chatId: 'chat-1', toolCallId: 'call-1' }))!,
    });

    const settled = await store.find({ chatId: 'chat-1', toolCallId: 'call-1' });

    expect(settled).not.toHaveProperty('pending');
    expect(settled?.settled?.at).toEqual(expect.any(String));
    expect(ttls.get(`${prefix}:call:chat-1:call-1`)).toBe(24 * 60 * 60_000);
    expect(await store.change({ expected: 0, question: storedQuestion({ revision: 1 }) })).toBe(
      false,
    );
  });

  it('settles with the piece’s change and indexes messages it adds', async () => {
    const { store } = storeFixture();
    const closed = { id: 'closed-1', postedAt: '' };

    await store.save({ questions: [storedQuestion()] });
    await store.settle({
      question: storedQuestion({ messages: [card, closed], state: { view: 'Answered' } }),
    });

    const [settled] = await store.findByMessage({
      threadId: 'channel:thread-1',
      messageId: 'closed-1',
    });

    expect(settled).toMatchObject({
      messages: [card, { id: 'closed-1', postedAt: expect.stringMatching(/^\d{4}-/) }],
      settled: { at: expect.any(String) },
      state: { view: 'Answered' },
    });
  });

  it('treats a claimed call as not yet rendered', async () => {
    const { store } = storeFixture();

    expect(await store.claim({ chatId: 'chat-1', toolCallId: 'call-1' })).toBe(true);
    expect(await store.claim({ chatId: 'chat-1', toolCallId: 'call-1' })).toBe(false);
    expect(await store.find({ chatId: 'chat-1', toolCallId: 'call-1' })).toBeNull();

    await store.release({ chatId: 'chat-1', toolCallId: 'call-1' });

    expect(await store.claim({ chatId: 'chat-1', toolCallId: 'call-1' })).toBe(true);
  });

  it('finds nothing for a thread the adapter cannot place', async () => {
    const memory = createMemoryKV();

    const store = createQuestionStore({
      adapter: {
        channelIdFromThreadId: () => {
          throw new Error('Unknown thread');
        },
      },
      kv: memory.kv as unknown as KV,
      namespace: 'support:slack',
    });

    expect(await store.findByMessage({ threadId: 'bad', messageId: 'card-1' })).toEqual([]);
  });
});
