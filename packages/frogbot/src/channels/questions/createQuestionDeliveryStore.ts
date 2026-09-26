import { setTimeout as sleep } from 'node:timers/promises';

import type { Adapter } from 'chat';

import type { DocID } from '../../collections/config/types.js';
import { KVLockContentionError } from '../../kv/errors.js';
import type { KV } from '../../kv/types.js';
import type { QuestionDelivery } from './types.js';

const DELIVERY_TTL = 30 * 24 * 60 * 60_000;
const SETTLED_TTL = 24 * 60 * 60_000;
const CLAIM_TTL = 5 * 60_000;
const LOCK_TTL = 10_000;
const LOCK_ATTEMPTS = 25;
const LOCK_RETRY_DELAY = 100;

type CallReference = { chatId: DocID; toolCallId: string };
type MessageReference = { threadId: string; messageId: string };
type MessageIndex = { chatId: DocID; toolCallIds: string[] };

export type QuestionDeliveryStore = ReturnType<typeof createQuestionDeliveryStore>;

export function createQuestionDeliveryStore({
  adapter,
  kv,
  namespace,
}: {
  adapter: Pick<Adapter, 'channelIdFromThreadId'>;
  kv: KV;
  namespace: string;
}) {
  const key = (value: string) => `channels:${namespace}:questions:${value}`;
  const callKey = ({ chatId, toolCallId }: CallReference) => key(`call:${chatId}:${toolCallId}`);
  const chatKey = (chatId: DocID) => key(`chat:${chatId}`);
  const lockKey = ({ chatId, toolCallId }: CallReference) => key(`lock:${chatId}:${toolCallId}`);
  const messageKey = ({ threadId, messageId }: MessageReference) =>
    key(`message:${adapter.channelIdFromThreadId(threadId)}:${messageId}`);

  const find = async (reference: CallReference): Promise<QuestionDelivery | null> => {
    const value = await kv.get<QuestionDelivery | { claimed: true }>(callKey(reference));

    return value && 'call' in value ? value : null;
  };

  const findMany = async ({ chatId, toolCallIds }: MessageIndex) => {
    const deliveries = await Promise.all(
      toolCallIds.map((toolCallId) => find({ chatId, toolCallId })),
    );

    return deliveries.filter((delivery): delivery is QuestionDelivery => delivery !== null);
  };

  const write = (delivery: QuestionDelivery, ttl: number) =>
    kv.set(callKey({ chatId: delivery.chatId, toolCallId: delivery.call.toolCallId }), delivery, {
      ttl,
    });

  const indexMessage = (delivery: QuestionDelivery, toolCallIds: string[]) =>
    kv.set(
      messageKey({ threadId: delivery.thread.id, messageId: delivery.messageId }),
      { chatId: delivery.chatId, toolCallIds } satisfies MessageIndex,
      { ttl: DELIVERY_TTL },
    );

  return {
    claim: (reference: CallReference): Promise<boolean> =>
      kv.setIfAbsent(callKey(reference), { claimed: true }, { ttl: CLAIM_TTL }),

    async release(reference: CallReference): Promise<void> {
      const value = await kv.get<object>(callKey(reference));

      if (value && 'claimed' in value) await kv.delete(callKey(reference));
    },

    async save(deliveries: QuestionDelivery[]): Promise<void> {
      if (deliveries.length === 0) return;

      const messages = new Map<string, QuestionDelivery[]>();

      deliveries.forEach((delivery) => {
        messages.set(delivery.messageId, [...(messages.get(delivery.messageId) ?? []), delivery]);
      });

      await Promise.all(deliveries.map((delivery) => write(delivery, DELIVERY_TTL)));

      await Promise.all(
        [...messages.values()].map((group) =>
          indexMessage(
            group[0]!,
            group.map(({ call }) => call.toolCallId),
          ),
        ),
      );

      const chatId = deliveries[0]!.chatId;
      const previous = await kv.get<MessageIndex>(chatKey(chatId));
      const open = previous ? (await findMany(previous)).filter(({ settled }) => !settled) : [];

      const toolCallIds = [...new Set([...open, ...deliveries].map(({ call }) => call.toolCallId))];

      await kv.set(chatKey(chatId), { chatId, toolCallIds } satisfies MessageIndex, {
        ttl: DELIVERY_TTL,
      });
    },

    async update(delivery: QuestionDelivery, previous: QuestionDelivery): Promise<void> {
      await write(delivery, DELIVERY_TTL);

      if (delivery.messageId !== previous.messageId) {
        await indexMessage(delivery, [delivery.call.toolCallId]);
      }
    },

    settle: (delivery: QuestionDelivery): Promise<void> =>
      write({ ...delivery, settled: true }, SETTLED_TTL),

    find,

    async findByChat({ chatId }: { chatId: DocID }): Promise<QuestionDelivery[]> {
      const index = await kv.get<MessageIndex>(chatKey(chatId));

      return index ? findMany(index) : [];
    },

    async findByMessage(reference: MessageReference): Promise<QuestionDelivery[]> {
      let indexKey: string;

      try {
        indexKey = messageKey(reference);
      } catch {
        return [];
      }

      const index = await kv.get<MessageIndex>(indexKey);

      return index ? findMany(index) : [];
    },

    async lock<T>(reference: CallReference, fn: () => Promise<T>): Promise<T> {
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
