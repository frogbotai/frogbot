import { setTimeout as sleep } from 'node:timers/promises';

import type { Adapter } from 'chat';

import type { DocID } from '../../collections/config/types.js';
import { KVLockContentionError } from '../../kv/errors.js';
import type { KV } from '../../kv/types.js';
import type { QuestionMessage, StoredQuestion } from './types.js';

const QUESTION_TTL = 30 * 24 * 60 * 60_000;
const SETTLED_TTL = 24 * 60 * 60_000;
const CLAIM_TTL = 5 * 60_000;
const LOCK_TTL = 10_000;
const LOCK_ATTEMPTS = 25;
const LOCK_RETRY_DELAY = 100;

export type QuestionReference = { chatId: DocID; toolCallId: string };

export type QuestionMessageReference = { threadId: string; messageId: string };

type QuestionIndex = { chatId: DocID; toolCallIds: string[] };

export type QuestionStore = ReturnType<typeof createQuestionStore>;

export function createQuestionStore({
  adapter,
  kv,
  namespace,
}: {
  adapter: Pick<Adapter, 'channelIdFromThreadId'>;
  kv: KV;
  namespace: string;
}) {
  const key = (value: string) => `channels:${namespace}:questions:${value}`;
  const callKey = ({ chatId, toolCallId }: QuestionReference) =>
    key(`call:${chatId}:${toolCallId}`);

  const chatKey = (chatId: DocID) => key(`chat:${chatId}`);
  const lockKey = ({ chatId, toolCallId }: QuestionReference) =>
    key(`lock:${chatId}:${toolCallId}`);

  const messageKey = ({ threadId, messageId }: QuestionMessageReference) =>
    key(`message:${adapter.channelIdFromThreadId(threadId)}:${messageId}`);

  const reference = (question: StoredQuestion): QuestionReference => ({
    chatId: question.chatId,
    toolCallId: question.call.toolCallId,
  });

  const find = async (reference: QuestionReference): Promise<StoredQuestion | null> => {
    const value = await kv.get<StoredQuestion | { claimed: true }>(callKey(reference));

    return value && 'call' in value ? value : null;
  };

  const findMany = async ({ chatId, toolCallIds }: QuestionIndex) => {
    const questions = await Promise.all(
      toolCallIds.map((toolCallId) => find({ chatId, toolCallId })),
    );

    return questions.filter((question): question is StoredQuestion => question !== null);
  };

  const write = (question: StoredQuestion, ttl: number) =>
    kv.set(callKey(reference(question)), question, { ttl });

  const indexMessage = ({
    chatId,
    messageId,
    threadId,
    toolCallIds,
  }: QuestionIndex & { messageId: string; threadId: string }) =>
    kv.set(messageKey({ threadId, messageId }), { chatId, toolCallIds } satisfies QuestionIndex, {
      ttl: QUESTION_TTL,
    });

  const indexNewMessages = ({
    next,
    previous,
  }: {
    next: StoredQuestion;
    previous: StoredQuestion | null;
  }) => {
    const known = new Set(previous?.messages.map(({ id }) => id));

    return Promise.all(
      next.messages
        .filter(({ id }) => !known.has(id))
        .map(({ id }) =>
          indexMessage({
            chatId: next.chatId,
            messageId: id,
            threadId: next.thread.id,
            toolCallIds: [next.call.toolCallId],
          }),
        ),
    );
  };

  return {
    claim: (reference: QuestionReference): Promise<boolean> =>
      kv.setIfAbsent(callKey(reference), { claimed: true }, { ttl: CLAIM_TTL }),

    async release(reference: QuestionReference): Promise<void> {
      const value = await kv.get<object>(callKey(reference));

      if (value && 'claimed' in value) await kv.delete(callKey(reference));
    },

    async save({ questions }: { questions: StoredQuestion[] }): Promise<void> {
      if (questions.length === 0) return;

      const saved = questions.map((question) => ({
        ...question,
        messages: normalizeMessages(question.messages),
      }));

      const { chatId, thread } = saved[0];

      await Promise.all(saved.map((question) => write(question, QUESTION_TTL)));

      const messages = new Map<string, string[]>();

      saved.forEach(({ call, messages: posted }) => {
        posted.forEach(({ id }) => {
          messages.set(id, [...(messages.get(id) ?? []), call.toolCallId]);
        });
      });

      await Promise.all(
        [...messages].map(([messageId, toolCallIds]) =>
          indexMessage({ chatId, messageId, threadId: thread.id, toolCallIds }),
        ),
      );

      const previous = await kv.get<QuestionIndex>(chatKey(chatId));
      const open = previous ? (await findMany(previous)).filter(({ settled }) => !settled) : [];

      const toolCallIds = [...new Set([...open, ...saved].map(({ call }) => call.toolCallId))];

      await kv.set(chatKey(chatId), { chatId, toolCallIds } satisfies QuestionIndex, {
        ttl: QUESTION_TTL,
      });
    },

    async change({
      expected,
      question,
    }: {
      expected: number;
      question: StoredQuestion;
    }): Promise<boolean> {
      const current = await find(reference(question));

      if (!current || current.settled || current.revision !== expected) return false;

      const next = { ...question, messages: normalizeMessages(question.messages) };

      await write(next, QUESTION_TTL);
      await indexNewMessages({ next, previous: current });

      return true;
    },

    async settle({ question }: { question: StoredQuestion }): Promise<void> {
      const { pending: _pending, ...settled } = question;
      const previous = await find(reference(question));

      const next = {
        ...settled,
        messages: normalizeMessages(settled.messages),
        settled: { at: new Date().toISOString() },
      };

      await write(next, SETTLED_TTL);
      await indexNewMessages({ next, previous });
    },

    find,

    async findByChat({ chatId }: { chatId: DocID }): Promise<StoredQuestion[]> {
      const index = await kv.get<QuestionIndex>(chatKey(chatId));

      return index ? findMany(index) : [];
    },

    async findByMessage(reference: QuestionMessageReference): Promise<StoredQuestion[]> {
      let indexKey: string;

      try {
        indexKey = messageKey(reference);
      } catch {
        return [];
      }

      const index = await kv.get<QuestionIndex>(indexKey);

      return index ? findMany(index) : [];
    },

    async lock<T>(reference: QuestionReference, fn: () => Promise<T>): Promise<T> {
      for (let attempt = 1; ; attempt++) {
        try {
          return await kv.lock(lockKey(reference), LOCK_TTL, fn);
        } catch (error) {
          if (!(error instanceof KVLockContentionError) || attempt === LOCK_ATTEMPTS) throw error;

          await sleep(LOCK_RETRY_DELAY);
        }
      }
    },
  };
}

function normalizeMessages(messages: QuestionMessage[]): QuestionMessage[] {
  if (messages.length === 0) {
    throw new Error('[frogbot] A channel question needs at least one message.');
  }

  const now = new Date().toISOString();

  return messages.map((message) => (message.postedAt ? message : { ...message, postedAt: now }));
}
